package com.moneytracker.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.app.NotificationCompat;

public class MainActivity extends Activity {

    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final String WEB_ORIGIN = "https://rydnichanin.github.io";
    private WebView webView;
    private boolean receiverRegistered;
    private static final String REMINDER_CHANNEL_ID = "moneytracker_reminders";

    private final BroadcastReceiver gpsReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !intent.hasExtra("distance_km") || webView == null) return;
            float distance = intent.getFloatExtra("distance_km", 0f);
            webView.post(() -> {
                if (webView == null || !webView.isAttachedToWindow()) return;
                String js = "if (typeof updateDistance === 'function') updateDistance(" + distance + ");";
                webView.evaluateJavascript(js, null);
            });
        }
    };

    private final BroadcastReceiver notificationReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || webView == null) return;
            String app = intent.getStringExtra("app");
            String title = intent.getStringExtra("title");
            String text = intent.getStringExtra("text");
            if (text == null || text.isEmpty()) return;
            webView.post(() -> {
                if (webView == null || !webView.isAttachedToWindow()) return;
                try {
                    org.json.JSONObject payload = new org.json.JSONObject();
                    payload.put("app", app != null ? app : "");
                    payload.put("title", title != null ? title : "");
                    payload.put("text", text);
                    String js = "if (typeof handleIncomingNotification === 'function') handleIncomingNotification(" + payload.toString() + ");";
                    webView.evaluateJavascript(js, null);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        configureWebView();
        handleAuthIntent(getIntent());

        webView.loadUrl("https://rydnichanin.github.io/MoneyTracker/index.html");
        checkAndRequestPermissions();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                deliverPendingAuth();
            }
        });
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");
        createReminderNotificationChannel();
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                boolean updatePrompt = message != null && message.startsWith("Доступна новая версия приложения");
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setTitle("Учёт Курьера Pro")
                        .setMessage(message)
                        .setPositiveButton(updatePrompt ? "Скачать" : "Да", (dialog, which) -> result.confirm())
                        .setNegativeButton(updatePrompt ? "Позже" : "Отмена", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                if (WEB_ORIGIN.equals(origin)) {
                    callback.invoke(origin, true, false);
                } else {
                    callback.invoke(origin, false, false);
                }
            }
        });
    }

    private String pendingAuthUrl = null;
    private boolean authDeliveryInFlight;
    private final Handler authHandler = new Handler(Looper.getMainLooper());

    private void handleAuthIntent(Intent intent) {
        if (intent == null) return;
        String authUrl = intent.getStringExtra("authUrl");
        if (authUrl != null) {
            pendingAuthUrl = authUrl;
            deliverPendingAuth();
        }
    }

    private void deliverPendingAuth() {
        if (pendingAuthUrl != null && webView != null && !authDeliveryInFlight) {
            authDeliveryInFlight = true;
            final String urlToDeliver = pendingAuthUrl;
            webView.post(() -> webView.evaluateJavascript(
                    "(function(){if(typeof window.handleAndroidAuth!=='function')return false;window.handleAndroidAuth(" +
                            org.json.JSONObject.quote(urlToDeliver) + ");return true;})()",
                    result -> {
                        authDeliveryInFlight = false;
                        if ("true".equals(result)) {
                            pendingAuthUrl = null;
                        } else if (pendingAuthUrl != null) {
                            // Firebase modules may still be loading when Android returns from Chrome.
                            authHandler.postDelayed(this::deliverPendingAuth, 300);
                        }
                    }));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!receiverRegistered) {
            registerReceiver(gpsReceiver, new IntentFilter("GPS_UPDATE"), Context.RECEIVER_NOT_EXPORTED);
            registerReceiver(notificationReceiver, new IntentFilter("com.moneytracker.NOTIFICATION"), Context.RECEIVER_NOT_EXPORTED);
            receiverRegistered = true;
        }
    }

    @Override
    protected void onPause() {
        if (receiverRegistered) {
            unregisterReceiver(gpsReceiver);
            unregisterReceiver(notificationReceiver);
            receiverRegistered = false;
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void startTrip() {
            Intent intent = new Intent(MainActivity.this, LocationService.class);
            intent.setAction("START");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }

        @JavascriptInterface
        public void stopTrip() {
            Intent intent = new Intent(MainActivity.this, LocationService.class);
            intent.setAction("STOP");
            startService(intent);
        }

        @JavascriptInterface
        public void openBrowser(String url) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            try {
                Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public boolean isNotificationAccessGranted() {
            try {
                String pkgName = getPackageName();
                final String flat = android.provider.Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                if (flat != null && !flat.isEmpty()) {
                    final String[] names = flat.split(":");
                    for (String name : names) {
                        final android.content.ComponentName cn = android.content.ComponentName.unflattenFromString(name);
                        if (cn != null && android.text.TextUtils.equals(pkgName, cn.getPackageName())) {
                            return true;
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }

        @JavascriptInterface
        public boolean canPostNotifications() {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public long getAppVersionCode() {
            try {
                android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            } catch (PackageManager.NameNotFoundException e) {
                return 0;
            }
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return info.versionName != null ? info.versionName : "";
            } catch (PackageManager.NameNotFoundException e) {
                return "";
            }
        }

        @JavascriptInterface
        public void requestPostNotificationsPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST_CODE + 1));
            }
        }

        @JavascriptInterface
        public void showReminderNotification(String title, String body, int notificationId) {
            if (!canPostNotifications()) return;
            runOnUiThread(() -> {
                NotificationManager manager = getSystemService(NotificationManager.class);
                if (manager == null) return;
                Intent openApp = new Intent(MainActivity.this, MainActivity.class);
                openApp.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent contentIntent = PendingIntent.getActivity(
                        MainActivity.this, 0, openApp,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));
                manager.notify(notificationId, new NotificationCompat.Builder(MainActivity.this, REMINDER_CHANNEL_ID)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setContentIntent(contentIntent)
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .build());
            });
        }
    }

    private void createReminderNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(new NotificationChannel(
                    REMINDER_CHANNEL_ID, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            java.util.ArrayList<String> missing = new java.util.ArrayList<>();
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                missing.add(Manifest.permission.POST_NOTIFICATIONS);
            if (!missing.isEmpty()) requestPermissions(missing.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }
}

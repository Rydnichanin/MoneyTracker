package com.moneytracker.app;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final String WEB_ORIGIN = "https://rydnichanin.github.io";
    private WebView webView;
    private boolean receiverRegistered;

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
        webView.setWebChromeClient(new WebChromeClient() {
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

    private void handleAuthIntent(Intent intent) {
        if (intent == null) return;
        String authUrl = intent.getStringExtra("authUrl");
        if (authUrl != null) {
            pendingAuthUrl = authUrl;
            deliverPendingAuth();
        }
    }

    private void deliverPendingAuth() {
        if (pendingAuthUrl != null && webView != null) {
            final String urlToDeliver = pendingAuthUrl;
            webView.post(() -> webView.evaluateJavascript(
                    "if (typeof handleAndroidAuth === 'function') { handleAndroidAuth(" +
                            org.json.JSONObject.quote(urlToDeliver) + "); }", null));
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
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.POST_NOTIFICATIONS
            }, PERMISSION_REQUEST_CODE);
        }
    }
}

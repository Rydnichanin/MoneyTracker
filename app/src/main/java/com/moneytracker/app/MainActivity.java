package com.moneytracker.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
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
    private static final int INSTALL_PERMISSION_REQUEST_CODE = 102;
    private static final String UPDATE_PREFS = "app_update";
    private static final String UPDATE_DOWNLOAD_ID = "download_id";
    private static final String WEB_ORIGIN = "https://rydnichanin.github.io";
    private WebView webView;
    private boolean receiverRegistered;
    private boolean updateReceiverRegistered;
    private boolean apkInstallStarted;
    private String pendingUpdateUrl;
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

    private final BroadcastReceiver updateDownloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            long expectedId = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1L);
            if (downloadId == expectedId) handleUpdateDownloadComplete(downloadId);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        configureWebView();
        registerUpdateDownloadReceiver();
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
        registerUpdateDownloadReceiver();
        recoverCompletedUpdateDownload();
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
        if (updateReceiverRegistered) {
            unregisterReceiver(updateDownloadReceiver);
            updateReceiverRegistered = false;
        }
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
        public void downloadAndInstallUpdate(String url) {
            runOnUiThread(() -> beginUpdateDownload(url));
        }

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

    private void beginUpdateDownload(String url) {
        Uri uri = Uri.parse(url == null ? "" : url);
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !"github.com".equalsIgnoreCase(uri.getHost())
                || !path.toLowerCase(java.util.Locale.ROOT).contains("/moneytracker/releases/")
                || !path.toLowerCase(java.util.Locale.ROOT).endsWith(".apk")) {
            Toast.makeText(this, "Не удалось проверить адрес обновления", Toast.LENGTH_LONG).show();
            return;
        }

        long existingId = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1L);
        if (existingId > 0 && isDownloadActive(existingId)) {
            Toast.makeText(this, "Обновление уже загружается", Toast.LENGTH_SHORT).show();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            pendingUpdateUrl = url;
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivityForResult(settingsIntent, INSTALL_PERMISSION_REQUEST_CODE);
            Toast.makeText(this, "Разрешите установку обновлений для Учёт Курьера Pro", Toast.LENGTH_LONG).show();
            return;
        }
        enqueueUpdateDownload(url);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == INSTALL_PERMISSION_REQUEST_CODE) {
            String url = pendingUpdateUrl;
            pendingUpdateUrl = null;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                if (url != null) enqueueUpdateDownload(url);
            } else {
                Toast.makeText(this, "Без этого разрешения Android не сможет установить APK", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void enqueueUpdateDownload(String url) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) {
            Toast.makeText(this, "Загрузчик Android недоступен", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            java.io.File downloadDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadDir != null) {
                java.io.File previousApk = new java.io.File(downloadDir, "MoneyTracker-update.apk");
                if (previousApk.exists()) previousApk.delete();
            }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Обновление Учёт Курьера Pro")
                    .setDescription("Скачиваем обновление приложения")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "MoneyTracker-update.apk");
            long id = manager.enqueue(request);
            getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().putLong(UPDATE_DOWNLOAD_ID, id).apply();
            Toast.makeText(this, "Скачиваю обновление в фоне. Ход загрузки виден в уведомлениях.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось начать загрузку обновления", Toast.LENGTH_LONG).show();
            e.printStackTrace();
        }
    }

    private boolean isDownloadActive(long id) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) return false;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) return false;
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0) return false;
            int status = cursor.getInt(statusIndex);
            return status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING
                    || status == DownloadManager.STATUS_PAUSED;
        } catch (Exception e) {
            return false;
        }
    }

    private void recoverCompletedUpdateDownload() {
        long id = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1L);
        if (id > 0 && !isDownloadActive(id)) handleUpdateDownloadComplete(id);
    }

    private void registerUpdateDownloadReceiver() {
        if (updateReceiverRegistered) return;
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateDownloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, filter);
        }
        updateReceiverRegistered = true;
    }

    private void handleUpdateDownloadComplete(long downloadId) {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) return;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0 || cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) {
                getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
                Toast.makeText(this, "Не удалось скачать APK. Проверьте интернет и попробуйте снова.", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось проверить загруженный APK", Toast.LENGTH_LONG).show();
            return;
        }

        if (apkInstallStarted) return;
        Uri apkUri = manager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            Toast.makeText(this, "Загруженный APK не найден", Toast.LENGTH_LONG).show();
            return;
        }
        Intent installIntent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            apkInstallStarted = true;
            getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
            startActivity(installIntent);
        } catch (Exception e) {
            apkInstallStarted = false;
            Toast.makeText(this, "Android не смог открыть установщик APK", Toast.LENGTH_LONG).show();
            e.printStackTrace();
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

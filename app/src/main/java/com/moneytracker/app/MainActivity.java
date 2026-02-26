package com.moneytracker.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {

    private WebView webView;
    private BroadcastReceiver notificationReceiver;

    // URL твоего приложения на GitHub Pages — замени на свой
    private static final String APP_URL = "https://Rydnichanin.github.io/MoneyTracker/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        setupWebView();

        // Проверяем разрешение на чтение уведомлений
        if (!isNotificationListenerEnabled()) {
            requestNotificationPermission();
        }

        // Слушаем уведомления от NotificationService
        setupNotificationReceiver();

        // Загружаем приложение
        webView.loadUrl(APP_URL);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // JavaScript мост — позволяет JS вызывать Java методы
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // Внешние ссылки открываем в браузере
                if (!url.contains("github.io") && !url.contains("firebaseapp")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }
        });
    }

    // JavaScript интерфейс
    public class WebAppInterface {
        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0";
        }
    }

    // Получаем уведомления от NotificationService и передаём в WebView
    private void setupNotificationReceiver() {
        notificationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String app = intent.getStringExtra("app");
                String title = intent.getStringExtra("title");
                String text = intent.getStringExtra("text");

                if (text == null) return;

                // Передаём уведомление в JavaScript
                final String js = String.format(
                    "window.onAndroidNotification && window.onAndroidNotification(%s, %s, %s);",
                    escapeJson(app),
                    escapeJson(title),
                    escapeJson(text)
                );

                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        };

        IntentFilter filter = new IntentFilter("com.moneytracker.NOTIFICATION");
        registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    }

    private String escapeJson(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    // Проверка разрешения на чтение уведомлений
    private boolean isNotificationListenerEnabled() {
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        if (!TextUtils.isEmpty(flat)) {
            String[] names = flat.split(":");
            for (String name : names) {
                ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null && getPackageName().equals(cn.getPackageName())) return true;
            }
        }
        return false;
    }

    private void requestNotificationPermission() {
        Toast.makeText(this,
            "Разрешите доступ к уведомлениям для автозаписи",
            Toast.LENGTH_LONG).show();
        startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (notificationReceiver != null) {
            unregisterReceiver(notificationReceiver);
        }
    }
}

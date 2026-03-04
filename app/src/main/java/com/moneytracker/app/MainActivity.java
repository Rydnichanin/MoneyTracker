package com.moneytracker.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {

    private WebView webView;
    private BroadcastReceiver notificationReceiver;
    private static final String APP_URL = "https://rydnichanin.github.io/MoneyTracker/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        setupWebView();
        
        if (!isNotificationListenerEnabled()) {
            requestNotificationPermission();
        }
        
        setupNotificationReceiver();
        webView.loadUrl(APP_URL);

        // Проверяем deep link при запуске
        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void openBrowser(String url) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(intent);
            }
        }, "AndroidBridge");
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        
        Uri data = intent.getData();
        if ("moneytracker".equals(data.getScheme()) && "auth".equals(data.getHost())) {
            String idToken = data.getQueryParameter("idToken");
            String name = data.getQueryParameter("name");
            String email = data.getQueryParameter("email");

            if (idToken != null) {
                // Экранируем спецсимволы для безопасности JS
                final String jsCode = String.format(
                    "if(window.receiveAuthToken){ window.receiveAuthToken({idToken:%s, name:%s, email:%s}); }",
                    escapeJson(idToken), escapeJson(name), escapeJson(email)
                );

                // Выполняем строго в главном потоке
                runOnUiThread(() -> webView.evaluateJavascript(jsCode, null));
            }
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\")
                       .replace("\"", "\\\"")
                       .replace("\n", "\\n") + "\"";
    }

    private boolean isNotificationListenerEnabled() {
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(getPackageName());
    }

    private void requestNotificationPermission() {
        startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    private void setupNotificationReceiver() {
        notificationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String title = intent.getStringExtra("title");
                String text = intent.getStringExtra("text");
                String app = intent.getStringExtra("app");
                String js = String.format("if(window.onNotificationReceived){ window.onNotificationReceived(%s, %s, %s); }",
                        escapeJson(title), escapeJson(text), escapeJson(app));
                runOnUiThread(() -> webView.evaluateJavascript(js, null));
            }
        };
        IntentFilter filter = new IntentFilter("com.moneytracker.NOTIFICATION");
        registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (notificationReceiver != null) unregisterReceiver(notificationReceiver);
    }
}

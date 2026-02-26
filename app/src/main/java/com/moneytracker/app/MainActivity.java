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
import androidx.browser.customtabs.CustomTabsIntent;

public class MainActivity extends Activity {

    private WebView webView;
    private BroadcastReceiver notificationReceiver;
    private static final String APP_URL = "https://Rydnichanin.github.io/MoneyTracker/";
    private static final String AUTH_URL = "https://Rydnichanin.github.io/MoneyTracker/auth.html";
    private Handler handler = new Handler();
    private Runnable authChecker;

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
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Когда возвращаемся из Chrome после входа — проверяем localStorage
        checkAuthFromChrome();
    }

    private void checkAuthFromChrome() {
        // Читаем токен который auth.html сохранил в localStorage
        webView.evaluateJavascript(
            "(function() {" +
            "  var token = localStorage.getItem('mt_auth_token');" +
            "  var name = localStorage.getItem('mt_auth_name');" +
            "  var email = localStorage.getItem('mt_auth_email');" +
            "  if (token) {" +
            "    localStorage.removeItem('mt_auth_token');" +
            "    return JSON.stringify({token: token, name: name, email: email});" +
            "  }" +
            "  return null;" +
            "})()",
            value -> {
                if (value != null && !value.equals("null")) {
                    // Токен найден — передаём в Firebase
                    webView.post(() -> webView.evaluateJavascript(
                        "window.receiveAuthToken && window.receiveAuthToken(" + value + ");",
                        null
                    ));
                }
            }
        );
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Убираем wv из UserAgent
        String ua = settings.getUserAgentString().replace("wv", "");
        settings.setUserAgentString(ua);

        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.contains("accounts.google.com") ||
                    url.contains("google.com/o/oauth2")) {
                    CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                        .setShowTitle(false)
                        .build();
                    customTabsIntent.launchUrl(MainActivity.this, Uri.parse(url));
                    return true;
                }
                return false;
            }
        });
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public void openBrowser(String url) {
            // Открываем auth.html в Chrome Custom Tabs
            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                .setShowTitle(false)
                .build();
            customTabsIntent.launchUrl(MainActivity.this, Uri.parse(url));
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.1";
        }
    }

    private void setupNotificationReceiver() {
        notificationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String app = intent.getStringExtra("app");
                String title = intent.getStringExtra("title");
                String text = intent.getStringExtra("text");
                if (text == null) return;
                final String js = String.format(
                    "window.onAndroidNotification && window.onAndroidNotification(%s, %s, %s);",
                    escapeJson(app), escapeJson(title), escapeJson(text)
                );
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        };
        IntentFilter filter = new IntentFilter("com.moneytracker.NOTIFICATION");
        registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    }

    private String escapeJson(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\")
                       .replace("\"", "\\\"")
                       .replace("\n", "\\n") + "\"";
    }

    private boolean isNotificationListenerEnabled() {
        String flat = Settings.Secure.getString(
            getContentResolver(), "enabled_notification_listeners");
        if (flat != null && !flat.isEmpty()) {
            for (String name : flat.split(":")) {
                ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null && getPackageName().equals(cn.getPackageName()))
                    return true;
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
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (notificationReceiver != null) unregisterReceiver(notificationReceiver);
    }
}

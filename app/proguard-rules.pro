# WebView JavaScript bridge methods must remain callable from JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep notification/location service entry points referenced by AndroidManifest.
-keep class com.moneytracker.app.NotificationService { *; }
-keep class com.moneytracker.app.LocationService { *; }
-keep class com.moneytracker.app.MainActivity { *; }
-keep class com.moneytracker.app.AuthActivity { *; }

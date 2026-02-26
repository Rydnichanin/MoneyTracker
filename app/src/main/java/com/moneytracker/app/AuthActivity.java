package com.moneytracker.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

public class AuthActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        Uri data = intent.getData();
        if (data != null) {
            // Передаём токен обратно в MainActivity
            Intent back = new Intent(this, MainActivity.class);
            back.putExtra("authUrl", data.toString());
            back.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(back);
        }
        finish();
    }
}

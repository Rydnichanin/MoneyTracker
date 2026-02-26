package com.moneytracker.app;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

public class NotificationService extends NotificationListenerService {

    // Пакеты приложений которые слушаем
    private static final String WHATSAPP_PKG = "com.whatsapp";
    private static final String WHATSAPP_BUSINESS_PKG = "com.whatsapp.w4b";
    private static final String KASPI_PKG = "kz.kaspi.mobile";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String pkg = sbn.getPackageName();

        // Слушаем только WhatsApp и Kaspi
        if (!pkg.equals(WHATSAPP_PKG) &&
            !pkg.equals(WHATSAPP_BUSINESS_PKG) &&
            !pkg.equals(KASPI_PKG)) {
            return;
        }

        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        if (extras == null) return;

        String title = extras.getString(Notification.EXTRA_TITLE, "");
        String text = extras.getString(Notification.EXTRA_TEXT, "");
        String bigText = extras.getString(Notification.EXTRA_BIG_TEXT, "");

        // Берём длинный текст если есть
        String fullText = bigText.length() > text.length() ? bigText : text;

        if (fullText.isEmpty()) return;

        // Определяем название приложения
        String appName;
        if (pkg.equals(KASPI_PKG)) {
            appName = "kaspi";
        } else {
            appName = "whatsapp";
        }

        // Отправляем в MainActivity через broadcast
        Intent intent = new Intent("com.moneytracker.NOTIFICATION");
        intent.putExtra("app", appName);
        intent.putExtra("title", title);
        intent.putExtra("text", fullText);
        intent.setPackage(getPackageName());
        sendBroadcast(intent);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Не нужно обрабатывать
    }
}

package com.moneytracker.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class LocationService extends Service implements LocationListener {

    private static final String CHANNEL_ID = "GPS_Tracker_Channel";
    private LocationManager locationManager;
    private Location lastLocation = null;
    private float totalDistanceInMeters = 0f;
    private boolean isTracking = false;

    private final IBinder binder = new LocalBinder();

    public class LocalBinder extends Binder {
        LocationService getService() {
            return LocationService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "START".equals(intent.getAction()) && !isTracking) {
            startTracking();
        } else if (intent != null && "STOP".equals(intent.getAction())) {
            stopTracking();
        }
        return START_STICKY;
    }

    private void startTracking() {
        isTracking = true;
        totalDistanceInMeters = 0f;
        lastLocation = null;

        // Показываем неудаляемое уведомление, чтобы Android не убил службу в кармане
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Поездка пишется")
            .setContentText("MoneyTracker считает километры...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build();

        startForeground(1, notification);

        try {
            // Запрашиваем обновления каждые 3 секунды или каждые 2 метра изменения положения
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000, 2, this);
        } catch (SecurityException e) {
            e.printStackTrace();
        }
    }

    private void stopTracking() {
        isTracking = false;
        locationManager.removeUpdates(this);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        if (lastLocation != null) {
            // Считаем расстояние между старой и новой точкой GPS
            float distance = lastLocation.distanceTo(location);
            // Игнорируем погрешности GPS (если прыгает на месте меньше метра)
            if (distance > 1.0) {
                totalDistanceInMeters += distance;
                // Отправляем текущий километраж обратно в MainActivity
                Intent intent = new Intent("GPS_UPDATE");
                intent.putExtra("distance_km", totalDistanceInMeters / 1000f);
                sendBroadcast(intent);
            }
        }
        lastLocation = location;
    }

    @Override
    public IBinder onBind(Intent intent) { return binder; }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES. O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "GPS Трекер курьера", NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}

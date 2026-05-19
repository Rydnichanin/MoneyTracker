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

    // Фильтры качества GPS
    private static final float MIN_DISTANCE_METERS = 10f;   // минимальный шаг (было 1м — слишком мало)
    private static final float MAX_DISTANCE_METERS = 300f;  // максимальный прыжок за 3 сек (защита от глюков)
    private static final float MAX_ACCURACY_METERS = 30f;   // игнорируем точки хуже 30м

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

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Поездка пишется")
            .setContentText("MoneyTracker считает километры...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build();

        startForeground(1, notification);

        try {
            // Обновления каждые 3 сек или каждые 10 метров
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000, 10, this);
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

        // Пропускаем точки с плохой точностью
        if (location.getAccuracy() > MAX_ACCURACY_METERS) return;

        if (lastLocation != null) {
            float distance = lastLocation.distanceTo(location);

            // Пропускаем шум (меньше 10м) и аномальные прыжки (больше 300м за 3 сек)
            if (distance >= MIN_DISTANCE_METERS && distance <= MAX_DISTANCE_METERS) {
                totalDistanceInMeters += distance;

                Intent broadcastIntent = new Intent("GPS_UPDATE");
                broadcastIntent.putExtra("distance_km", totalDistanceInMeters / 1000f);
                sendBroadcast(broadcastIntent);
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "GPS Трекер курьера", NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}

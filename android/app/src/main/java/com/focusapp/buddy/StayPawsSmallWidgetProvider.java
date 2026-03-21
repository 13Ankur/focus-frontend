package com.focusapp.buddy;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class StayPawsSmallWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "StayPawsWidgetData";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        int streak = prefs.getInt("currentStreak", 0);
        boolean isActive = prefs.getBoolean("isSessionActive", false);
        long lastUpdated = prefs.getLong("lastUpdated", 0);
        boolean isStale = (System.currentTimeMillis() - lastUpdated) > 3600000;

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_small);

            if (isStale && lastUpdated > 0) {
                views.setTextViewText(R.id.widget_streak_text, "Open app");
                views.setTextViewText(R.id.widget_streak_icon, "🐾");
            } else {
                views.setTextViewText(R.id.widget_streak_icon, isActive ? "🟢" : "🔥");
                views.setTextViewText(R.id.widget_streak_text, streak + " day\nstreak");
            }

            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent != null) {
                PendingIntent pendingIntent = PendingIntent.getActivity(
                        context, 0, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_small_root, pendingIntent);
            }

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}

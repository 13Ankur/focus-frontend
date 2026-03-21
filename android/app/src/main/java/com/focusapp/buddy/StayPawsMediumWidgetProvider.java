package com.focusapp.buddy;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

public class StayPawsMediumWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "StayPawsWidgetData";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        int streak = prefs.getInt("currentStreak", 0);
        int todayMinutes = prefs.getInt("todayFocusMinutes", 0);
        int dailyGoal = prefs.getInt("dailyGoal", 60);
        int totalKibble = prefs.getInt("totalKibble", 0);
        String activeBreed = prefs.getString("activeBreed", "Golden Retriever");
        boolean isActive = prefs.getBoolean("isSessionActive", false);
        long lastUpdated = prefs.getLong("lastUpdated", 0);
        boolean isStale = (System.currentTimeMillis() - lastUpdated) > 3600000;

        String kibbleStr = totalKibble >= 1000
                ? String.format("%.1fK", totalKibble / 1000.0)
                : String.valueOf(totalKibble);

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_medium);

            if (isStale && lastUpdated > 0) {
                views.setTextViewText(R.id.widget_breed_name, "Open StayPaws");
                views.setTextViewText(R.id.widget_streak, "to sync data");
                views.setTextViewText(R.id.widget_focus_progress, "");
                views.setTextViewText(R.id.widget_kibble, "");
                views.setViewVisibility(R.id.widget_progress_bar, View.GONE);
                views.setViewVisibility(R.id.widget_cta, View.GONE);
                views.setViewVisibility(R.id.widget_active_badge, View.GONE);
            } else {
                views.setTextViewText(R.id.widget_breed_name, activeBreed);
                views.setTextViewText(R.id.widget_streak, "🔥 " + streak + " day streak");
                views.setTextViewText(R.id.widget_focus_progress, "⏱ " + todayMinutes + "/" + dailyGoal + " min today");
                views.setTextViewText(R.id.widget_kibble, "🦴 " + kibbleStr + " kibble");

                // Progress bar
                views.setViewVisibility(R.id.widget_progress_bar, View.VISIBLE);
                int progressPercent = dailyGoal > 0 ? Math.min(100, (todayMinutes * 100) / dailyGoal) : 0;
                views.setProgressBar(R.id.widget_progress_bar, 100, progressPercent, false);

                // CTA
                views.setViewVisibility(R.id.widget_cta, View.VISIBLE);
                views.setTextViewText(R.id.widget_cta, isActive ? "🟢 Session active" : "Tap to start focusing →");

                // Active badge
                views.setViewVisibility(R.id.widget_active_badge, isActive ? View.VISIBLE : View.GONE);
            }

            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent != null) {
                PendingIntent pendingIntent = PendingIntent.getActivity(
                        context, 0, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_medium_root, pendingIntent);
            }

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}

package com.focusapp.buddy;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StayPawsWidget")
public class StayPawsWidgetPlugin extends Plugin {

    private static final String PREFS_NAME = "StayPawsWidgetData";

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        editor.putInt("currentStreak", call.getInt("currentStreak", 0));
        editor.putInt("todayFocusMinutes", call.getInt("todayFocusMinutes", 0));
        editor.putInt("dailyGoal", call.getInt("dailyGoal", 60));
        editor.putInt("totalKibble", call.getInt("totalKibble", 0));
        editor.putString("activeBreed", call.getString("activeBreed", "Golden Retriever"));
        editor.putLong("lastUpdated", System.currentTimeMillis());
        editor.apply();

        refreshWidgets(context);
        call.resolve();
    }

    @PluginMethod
    public void setSessionActive(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        boolean active = call.getBoolean("active", false);
        editor.putBoolean("isSessionActive", active);

        if (active) {
            double endTime = call.getDouble("sessionEndTime", 0.0);
            editor.putLong("sessionEndTime", (long) endTime);
        } else {
            editor.putLong("sessionEndTime", 0);
        }

        editor.putLong("lastUpdated", System.currentTimeMillis());
        editor.apply();

        refreshWidgets(context);
        call.resolve();
    }

    @PluginMethod
    public void reloadWidgets(PluginCall call) {
        refreshWidgets(getContext());
        call.resolve();
    }

    private void refreshWidgets(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);

            int[] smallIds = manager.getAppWidgetIds(
                    new ComponentName(context, StayPawsSmallWidgetProvider.class));
            if (smallIds.length > 0) {
                Intent smallIntent = new Intent(context, StayPawsSmallWidgetProvider.class);
                smallIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                smallIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, smallIds);
                context.sendBroadcast(smallIntent);
            }

            int[] mediumIds = manager.getAppWidgetIds(
                    new ComponentName(context, StayPawsMediumWidgetProvider.class));
            if (mediumIds.length > 0) {
                Intent mediumIntent = new Intent(context, StayPawsMediumWidgetProvider.class);
                mediumIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                mediumIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, mediumIds);
                context.sendBroadcast(mediumIntent);
            }
        } catch (Exception e) {
            // Widget classes may not exist yet during development
        }
    }
}

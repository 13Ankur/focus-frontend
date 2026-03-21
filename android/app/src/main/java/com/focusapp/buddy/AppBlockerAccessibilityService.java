package com.focusapp.buddy;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.HashSet;
import java.util.Set;

/**
 * AccessibilityService that detects when a blocked app is brought to the foreground
 * during an active focus session and launches a blocking overlay.
 */
public class AppBlockerAccessibilityService extends AccessibilityService {

    private static final String PREFS_NAME = "app_blocker_prefs";
    private static volatile boolean sBlockingActive = false;

    private Set<String> blockedPackages = new HashSet<>();
    private String breedName = "Your buddy";
    private boolean strictMode = false;
    private long sessionEndTime = 0;
    private String lastOverlayPackage = null;
    private long lastOverlayTime = 0;

    public static void setBlockingActive(boolean active) {
        sBlockingActive = active;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 300;
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
        setServiceInfo(info);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!sBlockingActive) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;

        CharSequence packageNameCS = event.getPackageName();
        if (packageNameCS == null) return;
        String packageName = packageNameCS.toString();

        if (packageName.equals("com.focusapp.buddy")) return;
        if (packageName.equals(getPackageName())) return;

        loadBlockListIfNeeded();

        if (sessionEndTime > 0 && System.currentTimeMillis() > sessionEndTime) {
            sBlockingActive = false;
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean("blocking_active", false).apply();
            return;
        }

        if (blockedPackages.contains(packageName)) {
            // Debounce: don't relaunch overlay for the same package within 2 seconds
            if (packageName.equals(lastOverlayPackage) &&
                System.currentTimeMillis() - lastOverlayTime < 2000) {
                return;
            }

            lastOverlayPackage = packageName;
            lastOverlayTime = System.currentTimeMillis();

            Intent overlayIntent = new Intent(this, BlockingOverlayActivity.class);
            overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |
                                   Intent.FLAG_ACTIVITY_CLEAR_TOP |
                                   Intent.FLAG_ACTIVITY_SINGLE_TOP);
            overlayIntent.putExtra("breed_name", breedName);
            overlayIntent.putExtra("strict_mode", strictMode);
            overlayIntent.putExtra("blocked_app", packageName);
            startActivity(overlayIntent);
        }
    }

    @Override
    public void onInterrupt() {
        // Required override
    }

    private void loadBlockListIfNeeded() {
        if (!blockedPackages.isEmpty()) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String listJson = prefs.getString("block_list", "[]");
        strictMode = prefs.getBoolean("strict_mode", false);
        breedName = prefs.getString("breed_name", "Your buddy");
        sessionEndTime = prefs.getLong("session_end_time", 0);

        blockedPackages.clear();
        try {
            JSONArray arr = new JSONArray(listJson);
            for (int i = 0; i < arr.length(); i++) {
                blockedPackages.add(arr.getString(i));
            }
        } catch (JSONException ignored) {}
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }
}

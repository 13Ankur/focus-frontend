package com.focusapp.buddy;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "AppBlocker")
public class AppBlockerPlugin extends Plugin {

    private static final String PREFS_NAME = "app_blocker_prefs";
    private static final String KEY_BLOCK_LIST = "block_list";
    private static final String KEY_STRICT_MODE = "strict_mode";
    private static final String KEY_BREED_NAME = "breed_name";
    private static final String KEY_SESSION_END = "session_end_time";
    private static final String KEY_BLOCKING_ACTIVE = "blocking_active";

    private static final Set<String> SYSTEM_PACKAGES = new HashSet<>(Arrays.asList(
        "com.android.systemui",
        "com.android.settings",
        "com.android.phone",
        "com.android.contacts",
        "com.android.dialer",
        "com.android.camera",
        "com.android.camera2",
        "com.android.emergency",
        "com.google.android.apps.maps",
        "com.google.android.dialer",
        "com.android.launcher",
        "com.android.launcher3",
        "com.google.android.apps.nexuslauncher",
        "com.focusapp.buddy"
    ));

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("reason", "Android UsageStats + AccessibilityService");
        call.resolve(result);
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean hasUsageStats = hasUsageStatsPermission();
        boolean hasAccessibility = isAccessibilityServiceEnabled();
        JSObject result = new JSObject();
        result.put("granted", hasUsageStats && hasAccessibility);
        result.put("usageStats", hasUsageStats);
        result.put("accessibility", hasAccessibility);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        boolean hasUsageStats = hasUsageStatsPermission();
        boolean hasAccessibility = isAccessibilityServiceEnabled();

        if (!hasUsageStats) {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } else if (!hasAccessibility) {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }

        JSObject result = new JSObject();
        result.put("granted", hasUsageStats && hasAccessibility);
        call.resolve(result);
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        JSArray appsArray = new JSArray();

        for (ApplicationInfo appInfo : packages) {
            if (SYSTEM_PACKAGES.contains(appInfo.packageName)) continue;
            if ((appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && !isKnownUserApp(appInfo.packageName)) continue;

            try {
                JSObject app = new JSObject();
                app.put("id", appInfo.packageName);
                app.put("name", pm.getApplicationLabel(appInfo).toString());
                app.put("category", categorizeApp(appInfo, pm));
                appsArray.put(app);
            } catch (Exception ignored) {}
        }

        JSObject result = new JSObject();
        result.put("apps", appsArray);
        call.resolve(result);
    }

    @PluginMethod
    public void startBlocking(PluginCall call) {
        JSArray appIds = call.getArray("appIds");
        boolean strictMode = call.getBoolean("strictMode", false);
        String breedName = call.getString("breedName", "Your buddy");
        long sessionEndTime = call.getDouble("sessionEndTime", 0.0).longValue();

        if (appIds == null || appIds.length() == 0) {
            call.reject("No apps to block");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_BLOCK_LIST, appIds.toString());
        editor.putBoolean(KEY_STRICT_MODE, strictMode);
        editor.putString(KEY_BREED_NAME, breedName);
        editor.putLong(KEY_SESSION_END, sessionEndTime);
        editor.putBoolean(KEY_BLOCKING_ACTIVE, true);
        editor.apply();

        AppBlockerAccessibilityService.setBlockingActive(true);

        call.resolve();
    }

    @PluginMethod
    public void stopBlocking(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_BLOCKING_ACTIVE, false).apply();

        AppBlockerAccessibilityService.setBlockingActive(false);

        call.resolve();
    }

    @PluginMethod
    public void isBlocking(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean active = prefs.getBoolean(KEY_BLOCKING_ACTIVE, false);

        if (active) {
            long endTime = prefs.getLong(KEY_SESSION_END, 0);
            if (endTime > 0 && System.currentTimeMillis() > endTime) {
                prefs.edit().putBoolean(KEY_BLOCKING_ACTIVE, false).apply();
                AppBlockerAccessibilityService.setBlockingActive(false);
                active = false;
            }
        }

        JSObject result = new JSObject();
        result.put("blocking", active);
        call.resolve(result);
    }

    // ── Permission checks ──

    private boolean hasUsageStatsPermission() {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private boolean isAccessibilityServiceEnabled() {
        String serviceName = getContext().getPackageName() + "/" +
                AppBlockerAccessibilityService.class.getCanonicalName();
        String enabledServices = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabledServices == null) return false;
        return enabledServices.contains(serviceName);
    }

    // ── App categorization ──

    private String categorizeApp(ApplicationInfo appInfo, PackageManager pm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int cat = appInfo.category;
            switch (cat) {
                case ApplicationInfo.CATEGORY_SOCIAL: return "social";
                case ApplicationInfo.CATEGORY_VIDEO:
                case ApplicationInfo.CATEGORY_AUDIO:
                case ApplicationInfo.CATEGORY_IMAGE: return "entertainment";
                case ApplicationInfo.CATEGORY_NEWS: return "news";
                case ApplicationInfo.CATEGORY_GAME: return "games";
                case ApplicationInfo.CATEGORY_PRODUCTIVITY: return "productivity";
                default: break;
            }
        }

        String pkg = appInfo.packageName.toLowerCase();
        if (pkg.contains("instagram") || pkg.contains("twitter") || pkg.contains("facebook") ||
            pkg.contains("snapchat") || pkg.contains("tiktok") || pkg.contains("reddit") ||
            pkg.contains("discord") || pkg.contains("whatsapp") || pkg.contains("telegram") ||
            pkg.contains("pinterest") || pkg.contains("tumblr") || pkg.contains("threads")) {
            return "social";
        }
        if (pkg.contains("youtube") || pkg.contains("netflix") || pkg.contains("spotify") ||
            pkg.contains("twitch") || pkg.contains("disney") || pkg.contains("hbo") ||
            pkg.contains("prime") || pkg.contains("hulu")) {
            return "entertainment";
        }
        if (pkg.contains("news") || pkg.contains("bbc") || pkg.contains("cnn") || pkg.contains("fox")) {
            return "news";
        }
        if (pkg.contains("game") || pkg.contains("candy") || pkg.contains("clash") || pkg.contains("roblox")) {
            return "games";
        }
        if (pkg.contains("amazon") || pkg.contains("flipkart") || pkg.contains("shop") ||
            pkg.contains("ebay") || pkg.contains("wish") || pkg.contains("myntra")) {
            return "shopping";
        }
        return "other";
    }

    private boolean isKnownUserApp(String packageName) {
        String pkg = packageName.toLowerCase();
        return pkg.contains("instagram") || pkg.contains("twitter") || pkg.contains("facebook") ||
               pkg.contains("snapchat") || pkg.contains("tiktok") || pkg.contains("youtube") ||
               pkg.contains("netflix") || pkg.contains("spotify") || pkg.contains("reddit") ||
               pkg.contains("discord") || pkg.contains("whatsapp") || pkg.contains("telegram") ||
               pkg.contains("chrome") || pkg.contains("firefox") || pkg.contains("samsung") ||
               pkg.contains("amazon") || pkg.contains("flipkart") || pkg.contains("game");
    }
}

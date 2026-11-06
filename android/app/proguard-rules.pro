# R8 renames and shrinks the release app. These rules keep only the
# entry points Android or Capacitor call by name.

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# Capacitor looks up plugin methods through annotations.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Classes named from AndroidManifest.xml.
-keep class com.focusapp.buddy.MainActivity { *; }
-keep class com.focusapp.buddy.BlockingOverlayActivity { *; }
-keep class com.focusapp.buddy.StayPawsSmallWidgetProvider { *; }
-keep class com.focusapp.buddy.StayPawsMediumWidgetProvider { *; }
-keep class com.focusapp.buddy.AppBlockerAccessibilityService { *; }
-keep class com.focusapp.buddy.UpiBridgeWebViewClient { *; }

-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

package com.focusapp.buddy;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Locale;

/**
 * Razorpay checkout runs inside the Capacitor WebView. UPI apps only open when
 * upi: and intent: navigations are handed to Android instead of the page.
 */
public class UpiBridgeWebViewClient extends BridgeWebViewClient {
    public UpiBridgeWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request == null ? null : request.getUrl();
        if (uri != null && openPaymentApp(view, uri.toString())) {
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    private boolean openPaymentApp(WebView view, String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.US);
        boolean upi = lower.startsWith("upi:");
        boolean intentUrl = lower.startsWith("intent:");
        if (!upi && !intentUrl) return false;

        try {
            Intent intent = intentUrl
                ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (intentUrl) {
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            }
            Context context = view.getContext();
            if (!(context instanceof Activity)) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            if (intent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(intent);
                return true;
            }
            String fallback = intent.getStringExtra("browser_fallback_url");
            if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                view.loadUrl(fallback);
            }
        } catch (ActivityNotFoundException ignored) {
            // No UPI app accepted the link. Leave checkout open.
        } catch (Exception ignored) {
            // A bad intent must not navigate the WebView to an error page.
        }
        return true;
    }
}

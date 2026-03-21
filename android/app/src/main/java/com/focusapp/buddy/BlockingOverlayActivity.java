package com.focusapp.buddy;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.Space;

/**
 * Full-screen overlay shown when a blocked app is opened during a focus session.
 * In strict mode, the dismiss button is hidden entirely.
 * In normal mode, there's a 10-second cooldown before the user can dismiss.
 */
public class BlockingOverlayActivity extends Activity {

    private static final int COOLDOWN_SECONDS = 10;

    private Button dismissButton;
    private TextView cooldownText;
    private CountDownTimer cooldownTimer;
    private boolean strictMode = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        String breedName = getIntent().getStringExtra("breed_name");
        if (breedName == null) breedName = "Your buddy";
        strictMode = getIntent().getBooleanExtra("strict_mode", false);

        buildUI(breedName);
    }

    private void buildUI(String breedName) {
        FrameLayout rootLayout = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.parseColor("#2D5A27"), Color.parseColor("#1a3a15")}
        );
        rootLayout.setBackground(bg);

        LinearLayout contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setGravity(Gravity.CENTER);
        int pad = dpToPx(32);
        contentLayout.setPadding(pad, pad, pad, pad);

        // Paw emoji
        TextView pawEmoji = new TextView(this);
        pawEmoji.setText("🐾");
        pawEmoji.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        pawEmoji.setGravity(Gravity.CENTER);
        contentLayout.addView(pawEmoji);

        addSpace(contentLayout, 24);

        // Title
        TextView title = new TextView(this);
        title.setText(breedName + " is eating!");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        contentLayout.addView(title);

        addSpace(contentLayout, 12);

        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("Stay focused! You can do this.\nGet back to your focus session.");
        subtitle.setTextColor(Color.parseColor("#AADDAA"));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLineSpacing(dpToPx(4), 1f);
        contentLayout.addView(subtitle);

        addSpace(contentLayout, 40);

        // Dog eating emoji
        TextView dogEmoji = new TextView(this);
        dogEmoji.setText("🐕\u200D🦺");
        dogEmoji.setTextSize(TypedValue.COMPLEX_UNIT_SP, 80);
        dogEmoji.setGravity(Gravity.CENTER);
        contentLayout.addView(dogEmoji);

        addSpace(contentLayout, 40);

        // Focus message
        TextView focusMsg = new TextView(this);
        focusMsg.setText("🔒 This app is blocked during your focus session");
        focusMsg.setTextColor(Color.parseColor("#88CC88"));
        focusMsg.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        focusMsg.setGravity(Gravity.CENTER);
        contentLayout.addView(focusMsg);

        addSpace(contentLayout, 24);

        if (!strictMode) {
            // Cooldown text
            cooldownText = new TextView(this);
            cooldownText.setText("Wait " + COOLDOWN_SECONDS + " seconds to dismiss");
            cooldownText.setTextColor(Color.parseColor("#AAAAAA"));
            cooldownText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            cooldownText.setGravity(Gravity.CENTER);
            contentLayout.addView(cooldownText);

            addSpace(contentLayout, 12);

            // Dismiss button (disabled initially)
            dismissButton = new Button(this);
            dismissButton.setText("Dismiss");
            dismissButton.setEnabled(false);
            dismissButton.setAlpha(0.4f);
            dismissButton.setTextColor(Color.WHITE);
            dismissButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            dismissButton.setTypeface(null, Typeface.BOLD);

            GradientDrawable btnBg = new GradientDrawable();
            btnBg.setColor(Color.parseColor("#666666"));
            btnBg.setCornerRadius(dpToPx(14));
            dismissButton.setBackground(btnBg);
            dismissButton.setPadding(dpToPx(24), dpToPx(14), dpToPx(24), dpToPx(14));

            LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                dpToPx(200), LinearLayout.LayoutParams.WRAP_CONTENT);
            btnParams.gravity = Gravity.CENTER;
            dismissButton.setLayoutParams(btnParams);

            dismissButton.setOnClickListener(v -> finish());
            contentLayout.addView(dismissButton);

            startCooldown();
        } else {
            // Strict mode message
            TextView strictMsg = new TextView(this);
            strictMsg.setText("⚡ Strict Mode is ON\nThis overlay will dismiss when your session ends.");
            strictMsg.setTextColor(Color.parseColor("#FFD700"));
            strictMsg.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            strictMsg.setGravity(Gravity.CENTER);
            strictMsg.setLineSpacing(dpToPx(2), 1f);
            contentLayout.addView(strictMsg);
        }

        // Go back to StayPaws button
        addSpace(contentLayout, 16);

        Button backButton = new Button(this);
        backButton.setText("Return to StayPaws");
        backButton.setTextColor(Color.WHITE);
        backButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        backButton.setTypeface(null, Typeface.BOLD);

        GradientDrawable backBg = new GradientDrawable();
        backBg.setColor(Color.parseColor("#4CAF50"));
        backBg.setCornerRadius(dpToPx(14));
        backButton.setBackground(backBg);
        backButton.setPadding(dpToPx(24), dpToPx(14), dpToPx(24), dpToPx(14));

        LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(
            dpToPx(240), LinearLayout.LayoutParams.WRAP_CONTENT);
        backParams.gravity = Gravity.CENTER;
        backButton.setLayoutParams(backParams);

        backButton.setOnClickListener(v -> {
            // Launch StayPaws
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.focusapp.buddy");
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(launchIntent);
            }
            finish();
        });
        contentLayout.addView(backButton);

        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT);
        rootLayout.addView(contentLayout, flp);
        setContentView(rootLayout);
    }

    private void startCooldown() {
        cooldownTimer = new CountDownTimer(COOLDOWN_SECONDS * 1000L, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                int secs = (int) (millisUntilFinished / 1000) + 1;
                if (cooldownText != null) {
                    cooldownText.setText("Wait " + secs + " seconds to dismiss");
                }
            }

            @Override
            public void onFinish() {
                if (cooldownText != null) {
                    cooldownText.setText("You can now dismiss");
                    cooldownText.setTextColor(Color.parseColor("#88CC88"));
                }
                if (dismissButton != null) {
                    dismissButton.setEnabled(true);
                    dismissButton.setAlpha(1f);

                    GradientDrawable enabledBg = new GradientDrawable();
                    enabledBg.setColor(Color.parseColor("#E8A544"));
                    enabledBg.setCornerRadius(dpToPx(14));
                    dismissButton.setBackground(enabledBg);
                }
            }
        };
        cooldownTimer.start();
    }

    private void addSpace(LinearLayout parent, int dpHeight) {
        Space space = new Space(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(dpHeight)));
        parent.addView(space);
    }

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics());
    }

    @Override
    public void onBackPressed() {
        if (strictMode) {
            // In strict mode, back button returns to StayPaws instead of dismissing
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.focusapp.buddy");
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(launchIntent);
            }
            finish();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (cooldownTimer != null) {
            cooldownTimer.cancel();
        }
        super.onDestroy();
    }
}

package com.focusapp.buddy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppBlockerPlugin.class);
        registerPlugin(StayPawsWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

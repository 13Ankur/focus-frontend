import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.focusapp.buddy',
  appName: 'Focus Buddy',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    allowNavigation: [
      'staypawsapi.zavvi.co.in',
      'api.revenuecat.com',
    ],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#7ED321',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: '#F8F8F5',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: false,
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#F8F8F5',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#F8F8F5',
  },
};

export default config;

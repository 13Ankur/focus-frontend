export const environment = {
  production: true,
  apiUrl: 'https://staypawsapi.zavvi.co.in',
  focusDurationMinutes: 25,
  kibblePerSession: 25,

  googleWebClientId: '1004463918618-ksrbdruue45a5ca8edusqpdhlfn6c768.apps.googleusercontent.com',
  googleIosClientId: '1004463918618-94eqedp5s5mivv9t0vrc92t4klokl2bo.apps.googleusercontent.com',
  googleAndroidClientId: '1004463918618-ksrbdruue45a5ca8edusqpdhlfn6c768.apps.googleusercontent.com',

  appleClientId: 'com.staypaws.app',
  appleRedirectUri: 'https://staypaws.zavvi.co.in/auth/apple/callback',

  // RevenueCat
  // ⚠️ TODO: Replace Android test key with production key when Google Play app is set up
  revenueCatApiKey: {
    ios: 'appl_OeYspijIChGBNykiicvABUKLewU',
    android: 'test_dCdyoioMFzDLnWvQvcyPaxcikGn',  // ← REPLACE with goog_... key when ready
  },
};

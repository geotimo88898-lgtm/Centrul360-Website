import type { CapacitorConfig } from '@capacitor/cli';

// The app loads the LIVE portal straight from the server (server.url below) instead of
// bundling a copy of the site into www/ - that folder only holds a one-line fallback page
// Capacitor requires to exist, never actually shown. This is what lets every future portal
// change ship instantly to installed apps with no App Store / Play Store resubmission, 
// only native-level changes (icon, permissions, push config) ever need a new build.
const config: CapacitorConfig = {
  appId: 'com.centrul360.portal',
  appName: 'Centrul360',
  webDir: 'www',
  server: {
    url: 'https://admin.centrul360.com/login',
    cleartext: false,
  },
};

export default config;

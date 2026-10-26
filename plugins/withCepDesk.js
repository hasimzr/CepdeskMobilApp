const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withCepDesk(config) {
  config = withAndroidManifest(config, (result) => {
    const app = result.modResults.manifest.application[0];
    app.$['android:usesCleartextTraffic'] = 'false';
    app.$['android:allowBackup'] = 'false';
    return result;
  });
  // Android 12+ uses the platform splash icon; earlier versions use the wordmark lockup.
  return withDangerousMod(config, ['android', async (result) => {
    const dir = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res/values-v31');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'cepdesk_splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
    <item name="android:windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
    <item name="android:windowSplashScreenIconBackgroundColor">@color/splashscreen_background</item>
    <item name="android:windowBackground">@drawable/ic_launcher_background</item>
  </style>
</resources>
`);
    return result;
  }]);
};

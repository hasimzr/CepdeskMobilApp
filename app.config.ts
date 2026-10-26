import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CepDesk',
  slug: 'cepdesk',
  version: '0.1.0',
  icon: './assets/branding/cepdesk-icon-v1.png',
  splash: { image: './assets/branding/cepdesk-splash-v1.png', resizeMode: 'contain', backgroundColor: '#10111B' },
  orientation: 'default',
  newArchEnabled: false,
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    package: 'dev.cepdesk.mobile',
    adaptiveIcon: { foregroundImage: './assets/branding/cepdesk-icon-v1.png', backgroundColor: '#10111B' },
    permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE', 'CHANGE_WIFI_MULTICAST_STATE'],
    allowBackup: false,
  },
  plugins: ['expo-secure-store', './plugins/withCepDesk'],
};
export default config;

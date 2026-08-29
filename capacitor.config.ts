import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gestaorural.app',
  appName: 'Gestão Rural',
  webDir: 'dist',
  android: {
    minWebViewVersion: 63,
  },
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth : false,
        biometricTitle : "Biometric login for capacitor sqlite",
        biometricSubTitle : "Log in using your biometric"
      }
    }
  },
};

export default config;

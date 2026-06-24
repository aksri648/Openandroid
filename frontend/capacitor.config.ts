import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.opencodecloud.mobile',
  appName: 'OpenCode Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    Filesystem: {
      iosSchemeName: 'ionic',
    },
  },
}

export default config

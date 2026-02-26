import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'it.amicofritto.ristoratore',
  appName: 'Amico Fritto Ristoratore',
  webDir: 'www',
  server: {
    url: 'https://v0-amicofritto.vercel.app/admin/dashboard',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'v0-amicofritto.vercel.app',
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config

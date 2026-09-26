import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for the App Store and Play Store (decision D1, scaffolded in slice 5).
 * `pnpm build` then `npx cap sync` copies `dist/` into the `ios/` and `android/` projects.
 * See docs/NATIVE.md for the build steps and the open decision (D23) on whether the shell
 * loads the bundled web app or the deployed site.
 */
const config: CapacitorConfig = {
  appId: 'app.diettracker.mobile',
  appName: 'Diet Tracker',
  webDir: 'dist',
  // Uncomment to make the shell a thin wrapper of the deployed site (D23 option A). The
  // session cookie then works unchanged because the page and the API share an origin.
  // server: { url: 'https://<your-railway-domain>', cleartext: false },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0c0f14',
  },
  android: {
    backgroundColor: '#0c0f14',
    allowMixedContent: false,
  },
}

export default config

import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for the App Store and Play Store (decision D1, scaffolded in slice 5).
 * `pnpm cap:sync` builds the web app for native and copies `dist/` into the `ios/` and
 * `android/` projects. The shell loads that bundled build and talks to the API with a
 * bearer token (D23, option B). See docs/NATIVE.md for the build steps.
 */
const config: CapacitorConfig = {
  appId: 'app.minori.mobile',
  appName: 'Minori',
  webDir: 'dist',
  ios: {
    // The web app pads for the notch and the home indicator itself (`env(safe-area-inset-*)`),
    // so the web view must not inset the content a second time.
    contentInset: 'never',
    backgroundColor: '#0c0f14',
  },
  android: {
    backgroundColor: '#0c0f14',
    allowMixedContent: false,
  },
}

export default config

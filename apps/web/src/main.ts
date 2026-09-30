import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import { isNative } from './lib/native'
import { queryClient, restorePersistedQueries } from './lib/query-client'
import { loadSessionToken } from './lib/session-token'
import { router } from './router'
import './styles/main.css'

// The native shells ship the build inside the app, so there is nothing for a service
// worker to cache; they need their session token before the first request instead.
if (isNative) await loadSessionToken()
else registerSW({ immediate: true })

// The last known day, targets and week come back from localStorage before the first
// navigation, so the router guard and every screen see them even with no network.
await restorePersistedQueries(__APP_VERSION__)

createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(router).mount('#app')

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import { queryClient, restorePersistedQueries } from './lib/query-client'
import { router } from './router'
import './styles/main.css'

registerSW({ immediate: true })

// The last known day, targets and week come back from localStorage before the first
// navigation, so the router guard and every screen see them even with no network.
await restorePersistedQueries(__APP_VERSION__)

createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(router).mount('#app')

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import { queryClient } from './lib/query-client'
import { router } from './router'
import './styles/main.css'

registerSW({ immediate: true })

createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(router).mount('#app')

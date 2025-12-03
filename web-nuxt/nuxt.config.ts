// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      collabWsUrl: import.meta.dev
        ? 'ws://localhost:1234'
        : 'ws://localhost:1234', // поменять позже на ws (или wss)://prod-domain
    },
  },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  modules: ['@nuxt/hints'],
});

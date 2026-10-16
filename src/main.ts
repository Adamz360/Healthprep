// src/main.ts
// Cloud-first bootstrap — Firestore is the primary DB.
// Dexie only caches exam questions for offline CBT mode.

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { syncPendingResponses } from './services/exam';
import './style.css';

async function bootstrap() {
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);

  // 1. Restore Firebase Auth session
  const auth = useAuthStore();
  try {
    await auth.initAuth();
  } catch (err) {
    console.error('[bootstrap] Auth init failed:', err);
  }

  // 2. Sync any pending offline exam data to Firestore
  if (auth.isAuthenticated) {
    try {
      const synced = await syncPendingResponses(auth.currentUser?.id ?? '');
      if (synced > 0) {
        console.log(`[bootstrap] Synced ${synced} pending exam responses to Firestore`);
      }
    } catch {
      // Offline — will retry on next boot
    }
  }

  // 3. Mount — always
  app.mount('#app');
}

bootstrap();
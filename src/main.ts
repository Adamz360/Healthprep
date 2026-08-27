// src/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import {
  seedDatabaseIfEmpty,
  ensureLeaderboardSeed,
  ensureDemoUserSeeded,
  ensureAdminUserSeeded,
} from './db';
import './style.css';

// ── Seeding ──────────────────────────────────────────────────────────
// Phase 1 must finish before Phase 2 because user accounts need a
// valid departmentId that Phase 1 creates. Phase 2 tasks have no
// interdependencies so they run in parallel.

async function seedReferenceData(): Promise<void> {
  await seedDatabaseIfEmpty(); // departments, subjects, questions
}

async function seedAccountsAndMocks(): Promise<void> {
  await Promise.all([
    ensureLeaderboardSeed(),
    ensureDemoUserSeeded(),
    ensureAdminUserSeeded(),
  ]);
}

// ── Mount ────────────────────────────────────────────────────────────

function mountApp(): void {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);
  app.mount('#app');
}

// ── Error fallback ───────────────────────────────────────────────────
// If anything during bootstrap throws, the user sees a message instead
// of a blank white page.

function showFatalError(err: unknown): void {
  console.error('[bootstrap] Fatal:', err);

  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      height:100vh;font-family:system-ui,sans-serif;
      color:#666;text-align:center;padding:2rem;
    ">
      <div>
        <h1 style="font-size:1.4rem;margin-bottom:.5rem;">
          Something went wrong
        </h1>
        <p style="max-width:36ch;margin:0 auto;line-height:1.6;">
          The app couldn't start. Try clearing your browser data
          and refreshing the page.
        </p>
      </div>
    </div>
  `;
}

// ── Boot ─────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await seedReferenceData();
  await seedAccountsAndMocks();
  mountApp();
}

bootstrap().catch(showFatalError);
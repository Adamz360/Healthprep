import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'department-select',
      component: () => import('../views/DepartmentSelectView.vue'),
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomeDashboardView.vue'),
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('../views/LeaderboardView.vue'),
    },
    {
      path: '/subjects/:departmentId',
      name: 'subjects',
      component: () => import('../views/SubjectListView.vue'),
      props: true,
    },
    {
      path: '/exam/:subjectId/start',
      name: 'exam-setup',
      component: () => import('../views/ExamSetupView.vue'),
      props: true,
    },
    {
      path: '/exam/session/:examSessionId',
      name: 'exam-session',
      component: () => import('../views/ExamSessionView.vue'),
      props: true,
    },
    {
      path: '/exam/results/:examSessionId',
      name: 'exam-results',
      component: () => import('../views/ResultsView.vue'),
      props: true,
    },
    {
      path: '/weak-areas',
      name: 'weak-areas',
      component: () => import('../views/WeakAreasView.vue'),
    },
    {
      path: '/wallet',
      name: 'wallet',
      component: () => import('../views/WalletView.vue'),
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: () => import('../views/admin/AdminDashboardView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('../views/admin/AdminUsersView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/content',
      name: 'admin-content',
      component: () => import('../views/admin/AdminContentView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/academic',
      name: 'admin-academic',
      component: () => import('../views/admin/AdminAcademicView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/payments',
      name: 'admin-payments',
      component: () => import('../views/admin/AdminPaymentsView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/leaderboard',
      name: 'admin-leaderboard',
      component: () => import('../views/admin/AdminLeaderboardView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { public: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPasswordView.vue'),
      meta: { public: true },
    },
  ],
});

// Global guard:
// 1. Restore the local auth session before any route resolves.
// 2. Unauthenticated users are redirected to /login (except on public routes).
// 3. Authenticated users are kept off /login and /register.
// 4. Authenticated students who haven't picked a department yet are routed
//    there first, everywhere except the picker itself. Admins have no
//    department context, so they're exempt from this check entirely.
// 5. Admin-only routes (/admin/*) reject non-admin visitors — signed out
//    users go to /login, signed-in students are bounced to /home.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.isReady) {
    await auth.initAuth();
  }

  const isPublicRoute = Boolean(to.meta.public);
  const requiresAdmin = Boolean(to.meta.requiresAdmin);

  if (!auth.isAuthenticated && !isPublicRoute) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (auth.isAuthenticated && isPublicRoute) {
    return { name: auth.isAdmin ? 'admin-dashboard' : auth.hasChosenDepartment ? 'home' : 'department-select' };
  }

  if (requiresAdmin && !auth.isAdmin) {
    return { name: 'home' };
  }

  if (auth.isAuthenticated && !auth.isAdmin && !auth.hasChosenDepartment && to.name !== 'department-select') {
    return { name: 'department-select' };
  }

  return true;
});

export default router;

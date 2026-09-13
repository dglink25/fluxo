import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  // ── Auth (routes publiques) ──────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },
  {
    path: 'verify-phone',
    loadComponent: () =>
      import('./features/auth/verify-phone/verify-phone.component').then(
        (m) => m.VerifyPhoneComponent,
      ),
  },
  // Invitation publique — accessible sans être connecté
  {
    path: 'invitations/:token',
    loadComponent: () =>
      import('./features/auth/invitation/invitation.component').then(
        (m) => m.InvitationComponent,
      ),
  },

  // ── App (routes protégées) ───────────────────────────────────────────────
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'workspaces/:workspaceId/projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/project/project-list/project-list.component').then(
        (m) => m.ProjectListComponent,
      ),
  },
  {
    path: 'projects/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/project/project-detail/project-detail.component').then(
        (m) => m.ProjectDetailComponent,
      ),
  },
  {
    path: 'messaging',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/messaging/messaging.component').then((m) => m.MessagingComponent),
  },
  {
    path: 'call',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/call/call.component').then((m) => m.CallComponent),
  },
  {
    path: 'search',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/search/search.component').then((m) => m.SearchComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },

  // Fallback
  { path: '**', redirectTo: 'dashboard' },
];

/**
 * Route map. Three isolated map contexts share one persistent map canvas:
 *   /                Discover (public events; works signed-out)
 *   /maps/:mapId     Personal map (auth)
 *   /collab/:mapId   Collaboration map (auth)
 * Plus overlay routes: /settings/:section, /invite/:token, /friend/:code,
 * and the standalone /auth page.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { WelcomeOverlay } from './WelcomeOverlay';
import { AuthPage } from '@/features/auth/AuthPage';
import { DiscoverView } from '@/features/discover/DiscoverView';
import { PersonalMapView } from '@/features/maps/PersonalMapView';
import { CollabMapView } from '@/features/collaboration/CollabMapView';
import { InvitePage } from '@/features/collaboration/InvitePage';
import { FriendLinkPage } from '@/features/friends/FriendLinkPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

// Dev-only verification harness; the DEV guard lets the bundler drop it from production.
const MarkerCheck = import.meta.env.DEV ? lazy(() => import('@/dev/MarkerCheck').then((m) => ({ default: m.MarkerCheck }))) : null;

export function App() {
  return (
    <>
      <WelcomeOverlay />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        {MarkerCheck && <Route path="/__dev/marker-check" element={<Suspense fallback={null}><MarkerCheck /></Suspense>} />}
        <Route element={<AppShell />}>
          <Route index element={<DiscoverView />} />
          <Route path="maps/:mapId" element={<RequireAuth><PersonalMapView /></RequireAuth>} />
          <Route path="collab/:mapId" element={<RequireAuth><CollabMapView /></RequireAuth>} />
          <Route path="invite/:token" element={<RequireAuth><InvitePage /></RequireAuth>} />
          <Route path="friend/:code" element={<RequireAuth><FriendLinkPage /></RequireAuth>} />
          <Route path="settings" element={<Navigate to="/settings/account" replace />} />
          <Route path="settings/:section" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

/**
 * Route map. One persistent map canvas, two contexts:
 *   / , /maps        "My Map" -> the last-used personal map (share-link query kept);
 *                    discovery-only when there is no map yet
 *   /maps/:mapId     The unified map: discovery (nearby places, events) + your pins
 *   /chess[/:id]     Chess room over the map (discovery stays live underneath)
 *   /collab          "Shared" tab (choose a collaboration map)
 *   /collab/:mapId   Collaboration map (auth)
 * Plus overlay routes: /settings/:section, /invite/:token, /friend/:code,
 * and the standalone /auth page.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { WelcomeOverlay } from './WelcomeOverlay';
import { TutorialRoot } from '@/features/tutorial/TutorialRoot';
import { DiscoverView } from '@/features/discover/DiscoverView';
import { PersonalMapView } from '@/features/maps/PersonalMapView';
import { CollabMapView } from '@/features/collaboration/CollabMapView';
import { MapsHome } from '@/features/maps/MapsHome';
import { CollabHome } from '@/features/collaboration/CollabHome';
import { Spinner } from '@/components/ui/Feedback';

// Infrequently used routes are code-split so the initial bundle stays small.
const AuthPage = lazy(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const InvitePage = lazy(() => import('@/features/collaboration/InvitePage').then((m) => ({ default: m.InvitePage })));
const FriendLinkPage = lazy(() => import('@/features/friends/FriendLinkPage').then((m) => ({ default: m.FriendLinkPage })));
const DemoCollabView = lazy(() => import('@/features/collaboration/DemoCollabView').then((m) => ({ default: m.DemoCollabView })));
const ChessRoom = lazy(() => import('@/features/chess/ChessRoom').then((m) => ({ default: m.ChessRoom })));
const TreasureRoom = lazy(() => import('@/features/collectibles/TreasureRoom').then((m) => ({ default: m.TreasureRoom })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const RouteFallback = () => (
  <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner /></div>
);

// Dev-only verification harness; the DEV guard lets the bundler drop it from production.
const MarkerCheck = import.meta.env.DEV ? lazy(() => import('@/dev/MarkerCheck').then((m) => ({ default: m.MarkerCheck }))) : null;
const RevealCheck = import.meta.env.DEV ? lazy(() => import('@/dev/RevealCheck').then((m) => ({ default: m.RevealCheck }))) : null;
const MonumentGallery = import.meta.env.DEV ? lazy(() => import('@/dev/MonumentGallery').then((m) => ({ default: m.MonumentGallery }))) : null;

export function App() {
  const { recovering } = useAuth();
  const { pathname } = useLocation();
  return (
    <>
      <WelcomeOverlay />
      {/* Recovery links may land on the Site URL; always show the reset form. */}
      {recovering && pathname !== '/auth' && <Navigate to="/auth" replace />}
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        {MarkerCheck && <Route path="/__dev/marker-check" element={<MarkerCheck />} />}
        {MonumentGallery && <Route path="/__dev/monuments" element={<MonumentGallery />} />}
        {RevealCheck && <Route path="/__dev/reveal" element={<RevealCheck />} />}
        <Route element={<AppShell />}>
          {/* The chess room overlays Discover (its venue is a Discover place), so the map, markers and inspector stay live underneath. */}
          <Route index element={<MapsHome />} />
          <Route element={<><DiscoverView /><Outlet /></>}>
            <Route path="chess" element={<ChessRoom />} />
            <Route path="chess/:gameId" element={<ChessRoom />} />
          </Route>
          {/* Personal maps work for guests too (local workspace) — no auth wall. */}
          <Route path="maps" element={<MapsHome />} />
          <Route path="maps/:mapId" element={<PersonalMapView />} />
          {/* Local, clearly-labelled collaboration demo; real collaboration needs an account. */}
          <Route path="collab" element={<CollabHome />} />
          <Route path="collab/demo" element={<DemoCollabView />} />
          <Route path="collab/:mapId" element={<RequireAuth><CollabMapView /></RequireAuth>} />
          <Route path="invite/:token" element={<RequireAuth reason="invite"><InvitePage /></RequireAuth>} />
          <Route path="friend/:code" element={<RequireAuth reason="friends"><FriendLinkPage /></RequireAuth>} />
          <Route path="treasure" element={<TreasureRoom />} />
          <Route path="settings" element={<Navigate to="/settings/account" replace />} />
          <Route path="settings/:section" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
      <TutorialRoot />
    </>
  );
}

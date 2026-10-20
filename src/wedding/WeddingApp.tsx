import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Gate } from './Gate';
import { Layout } from './Layout';
import { Persistence } from './Persistence';
import { isOnline } from './useOnline';
import { PERSIST_MAX_AGE_MS } from './lib/persist';
import { HomePage } from './pages/HomePage';
import { TargetsPage } from './pages/TargetsPage';
import { SettingsPage } from './pages/SettingsPage';
import { MorePage } from './pages/MorePage';
import { ComingSoon } from './pages/ComingSoon';
import { HoneymoonPage } from './pages/HoneymoonPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { BudgetPage } from './pages/BudgetPage';
import { QuotesPage } from './pages/QuotesPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { SpendingPage } from './pages/SpendingPage';
import { TasksPage } from './pages/TasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { GuestsPage } from './pages/GuestsPage';
import { VendorsPage } from './pages/VendorsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ExportPage } from './pages/ExportPage';
import { TeamPage } from './pages/TeamPage';
import { JoinPage } from './pages/JoinPage';
import { CollabApp } from './collab/CollabApp';

// Keeps HQ out of search engines and restores the page head on the way out.
function useHqHead() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Wedding HQ';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);
}

// The service worker's scope is /hq/, which does not include "/hq" itself, so
// the app always lives at "/hq/" (offline reloads of Home need the worker).
function EnsureTrailingSlash() {
  const { pathname, search, hash } = useLocation();
  return pathname === '/hq' ? <Navigate to={{ pathname: '/hq/', search, hash }} replace /> : null;
}

export default function WeddingApp() {
  useHqHead();
  // Scoped to HQ: not shared with the rest of Valere.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // Offline: try once (so a restored copy shows and a screen with no
            // copy errors honestly) and never sit in a paused "loading" state.
            networkMode: 'offlineFirst',
            retry: (failures) => failures < 1 && isOnline(),
            // Keep restored data in memory so unvisited screens stay in the next snapshot.
            gcTime: PERSIST_MAX_AGE_MS,
          },
          // Writes fail immediately while offline (see assertOnline); never queued.
          mutations: { networkMode: 'always' },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <Persistence>
        <Routes>
          {/* The invite page is outside the gate: the person has no wedding yet. */}
          <Route path="join" element={<JoinPage />} />
          <Route
            path="*"
            element={
              <Gate collaborator={<CollabApp />}>
                <EnsureTrailingSlash />
                <Layout>
                  <Routes>
                    <Route index element={<HomePage />} />
                    <Route path="targets" element={<TargetsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="team" element={<TeamPage />} />
                    <Route path="budget" element={<BudgetPage />} />
                    <Route path="quotes" element={<QuotesPage />} />
                    <Route path="invoices" element={<InvoicesPage />} />
                    <Route path="spending" element={<SpendingPage />} />
                    <Route path="tasks" element={<TasksPage />} />
                    <Route path="calendar" element={<CalendarPage />} />
                    <Route path="more" element={<MorePage />} />
                    <Route path="honeymoon" element={<HoneymoonPage />} />
                    <Route path="purchases" element={<PurchasesPage />} />
                    <Route path="guests" element={<GuestsPage />} />
                    <Route path="vendors" element={<VendorsPage />} />
                    <Route path="activity" element={<ActivityPage />} />
                    <Route path="export" element={<ExportPage />} />
                    <Route path="*" element={<ComingSoon name="This page" />} />
                  </Routes>
                </Layout>
              </Gate>
            }
          />
        </Routes>
      </Persistence>
    </QueryClientProvider>
  );
}

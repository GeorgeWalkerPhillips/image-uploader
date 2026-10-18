import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Gate } from './Gate';
import { Layout } from './Layout';
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

export default function WeddingApp() {
  useHqHead();
  // Scoped to HQ: not shared with the rest of Valere.
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } })
  );

  return (
    <QueryClientProvider client={client}>
      <Gate>
        <Layout>
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="targets" element={<TargetsPage />} />
            <Route path="settings" element={<SettingsPage />} />
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
            <Route path="*"element={<ComingSoon name="This page" />} />
          </Routes>
        </Layout>
      </Gate>
    </QueryClientProvider>
  );
}

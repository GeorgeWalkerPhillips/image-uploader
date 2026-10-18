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

const LATER = ['budget', 'tasks', 'calendar', 'honeymoon', 'purchases', 'quotes', 'invoices', 'spending'];

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
            <Route path="more" element={<MorePage />} />
            {LATER.map((p) => (
              <Route key={p} path={p} element={<ComingSoon name={p} />} />
            ))}
            <Route path="*" element={<ComingSoon name="This page" />} />
          </Routes>
        </Layout>
      </Gate>
    </QueryClientProvider>
  );
}

'use client';
// app/components/GaEvents.tsx
//
// Fires GA4 conversion events based on URL search params.
// Rendered inside <Suspense> so useSearchParams() doesn't block the page.
//
// Events fired:
//   purchase             — ?upgraded=1  (plan upgrade completed)
//   reactivate_sub       — ?reactivated=1 (subscription reactivated)

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// gtag is injected globally by the GA script in layout.tsx
function fireEvent(name: string, params?: Record<string, string>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.('event', name, params);
  } catch { /* GA may not be loaded in dev */ }
}

export default function GaEvents() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('upgraded') === '1') {
      fireEvent('purchase', { event_category: 'subscription', event_label: 'upgrade' });
    }
    if (searchParams.get('reactivated') === '1') {
      fireEvent('reactivate_sub', { event_category: 'subscription' });
    }
  }, [searchParams]);

  return null;
}

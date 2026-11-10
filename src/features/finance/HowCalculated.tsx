import type { ReactNode } from 'react';
import { Alert } from '@/components/Alert';

/** The short "how this is calculated" note shown at the top of every finance tab. */
export function HowCalculated({ children }: { children: ReactNode }) {
  return (
    <Alert tone="info" title="How this is calculated">
      {children}
    </Alert>
  );
}

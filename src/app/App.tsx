import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';
import { isSupabaseConfigured, isDemo, exitDemo } from '@/lib/supabase';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SetupScreen } from './SetupScreen';
import { router } from './routes';

export function App() {
  if (!isSupabaseConfigured) return <SetupScreen />;
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <>{isDemo && <Alert tone="info" title="Demo — sample data" action={<Button onClick={() => void exitDemo()}>Exit demo</Button>}>Changes stay in the demo sandbox. People invitations are simulated.</Alert>}<RouterProvider router={router} /></>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../design-system/tokens.css';
import '../design-system/components/components.css';
import '@/styles/app.css';
import '@/styles/print.css';
import { initTheme } from '@/lib/theme';
import { App } from '@/app/App';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

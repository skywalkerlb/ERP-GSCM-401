import { Button } from '@/components/Button';
import { useTheme } from '@/lib/theme';

/** Light and dark theme switch. Sets data-theme on <html> and remembers the choice. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return <Button className="app-theme-btn" variant="ghost" icon={theme === 'dark' ? 'sun' : 'moon'} aria-label={`Switch to ${next} theme`} onClick={toggleTheme} />;
}

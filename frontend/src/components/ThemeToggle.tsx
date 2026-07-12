import { useTheme } from '../lib/theme';
import { DynamicIcon } from '../lib/icons';

export default function ThemeToggle() {
  const [theme, toggleTheme] = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      className="icon-btn theme-toggle"
      onClick={toggleTheme}
      type="button"
      title={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      aria-pressed={isDark}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <span className="theme-toggle-sun">
          <DynamicIcon name="sun" size={16} />
        </span>
        <span className="theme-toggle-moon">
          <DynamicIcon name="moon" size={16} />
        </span>
      </span>
    </button>
  );
}

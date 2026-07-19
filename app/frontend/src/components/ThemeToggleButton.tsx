import { useTheme } from '../lib/theme';
import { DynamicIcon } from '../lib/icons';

interface Props {
  className?: string;
}

// زرار تبديل الثيم العائم — بيتحط في الشاشات اللي مفيهاش قائمة جانبية أصلًا
// (تسجيل الدخول، وضع الصيانة) عشان الزائر يقدر يبدّل فاتح/غامق حتى قبل ما
// يسجّل دخول. الأيقونة بتتحرك بأنيميشن دوران وتلاشي بين شمس/قمر، وده بيتحكم
// فيه بالكامل عن طريق CSS مربوط بـ [data-theme] على عنصر <html> — فمتزامن
// تلقائيًا مع أي تبديل ثيم بيحصل من أي مكان تاني في الموقع.
export default function ThemeToggleButton({ className = '' }: Props) {
  const [theme, toggleTheme] = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-fab ${className}`.trim()}
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
    >
      <span className="theme-fab-icons" aria-hidden="true">
        <DynamicIcon name="sun" size={19} className="theme-fab-icon theme-fab-icon-sun" />
        <DynamicIcon name="moon" size={19} className="theme-fab-icon theme-fab-icon-moon" />
      </span>
    </button>
  );
}

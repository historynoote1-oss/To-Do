// سجل مركزي للأيقونات الاحترافية (Lucide) — بديل الإيموجي في كل الموقع.
// أي مكان كان بيخزّن "إيموجي" كقيمة (تصنيف، مجال حياة، وضع الصيانة...)
// بقى يخزّن *مفتاح نصي* بدل الرمز، وده بيرندره عن طريق DynamicIcon.
// كده الشكل موحّد، قابل للتحجيم بالـ CSS، ومتوافق مع أي ثيم (فاتح/غامق).

import type { CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Baby,
  Ban,
  BarChart3,
  Bell,
  BellOff,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CalendarRange,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  ClipboardList,
  Coffee,
  Compass,
  Construction,
  Dumbbell,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Feather,
  Flag,
  Flame,
  Flower2,
  Folder,
  FolderOpen,
  Gamepad2,
  Gauge,
  Gift,
  Globe2,
  GraduationCap,
  Hand,
  HandHeart,
  History,
  Home,
  Hourglass,
  Key,
  Landmark,
  Laptop,
  Leaf,
  Link2,
  ListChecks,
  ListMusic,
  LogOut,
  Lock,
  Mic2,
  Minus,
  Moon,
  MoonStar,
  Mountain,
  Music,
  Paintbrush,
  Palette,
  PartyPopper,
  PawPrint,
  Pause,
  Pencil,
  PiggyBank,
  Plane,
  Play,
  Plus,
  Puzzle,
  Redo2,
  Repeat,
  Rocket,
  RotateCcw,
  RotateCw,
  Route,
  Save,
  Search,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Shirt,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  StickyNote,
  Sun,
  Sunrise,
  Tag,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Unlink,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wallet,
  Waves,
  Megaphone,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

// أيقونة القلب (زرار "إضافة للمفضّلة") متعمولة كـ SVG مكتوب يدويًا هنا، مش
// مستوردة من مكتبة lucide-react زي باقي الأيقونات. السبب: لو حصلت أي مشكلة
// في تحميل/تجميع (bundling) مكتبة الأيقونات على السيرفر اللي الموقع منشور
// عليه، الأيقونة دي هتفضل شغّالة لأنها مش معتمدة عليها خالص — نفس الشكل
// (Heart) بالظبط لكن SVG مستقل تمامًا. لو حصلت نفس المشكلة مع أيقونة تانية
// في المستقبل، ممكن نستخدم نفس الأسلوب ده معاها.
function HeartIcon({
  size = 18,
  strokeWidth = 2,
  className,
  style,
  ...rest
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...rest}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  );
}

// نوع بسيط بيوصف "أي مكوّن أيقونة قابل للاستخدام هنا" — بيقبل مكوّنات
// lucide-react العادية وكمان مكوّنات SVG مكتوبة يدويًا زي HeartIcon فوق،
// من غير ما نتقيّد بالشكل الداخلي الكامل لمكوّنات lucide (اللي ممكن يمنع
// إضافة مكوّن بديل بسيط بنفس الخصائص).
type IconComponent = (props: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}) => JSX.Element | null;

export const ICON_MAP = {
  activity: Activity,
  alert: AlertTriangle,
  archive: Archive,
  'arrow-right': ArrowRight,
  baby: Baby,
  ban: Ban,
  'bar-chart': BarChart3,
  bell: Bell,
  'bell-off': BellOff,
  megaphone: Megaphone,
  bike: Bike,
  'book-open': BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  building: Building2,
  calendar: Calendar,
  'calendar-days': CalendarDays,
  'calendar-range': CalendarRange,
  camera: Camera,
  car: Car,
  check: Check,
  'check-circle': CheckCircle2,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-up': ChevronUp,
  'chevrons-down': ChevronsDown,
  'chevrons-up': ChevronsUp,
  circle: Circle,
  'clipboard-list': ClipboardList,
  coffee: Coffee,
  compass: Compass,
  construction: Construction,
  dumbbell: Dumbbell,
  download: Download,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  feather: Feather,
  flag: Flag,
  flame: Flame,
  flower: Flower2,
  folder: Folder,
  'folder-open': FolderOpen,
  gamepad: Gamepad2,
  gauge: Gauge,
  gift: Gift,
  globe: Globe2,
  'graduation-cap': GraduationCap,
  hand: Hand,
  'hand-heart': HandHeart,
  heart: HeartIcon,
  history: History,
  home: Home,
  hourglass: Hourglass,
  key: Key,
  landmark: Landmark,
  laptop: Laptop,
  leaf: Leaf,
  'link-2': Link2,
  'list-checks': ListChecks,
  'list-music': ListMusic,
  'log-out': LogOut,
  lock: Lock,
  mic: Mic2,
  minus: Minus,
  moon: Moon,
  'moon-star': MoonStar,
  mountain: Mountain,
  music: Music,
  paintbrush: Paintbrush,
  palette: Palette,
  'party-popper': PartyPopper,
  'paw-print': PawPrint,
  pause: Pause,
  pencil: Pencil,
  'piggy-bank': PiggyBank,
  plane: Plane,
  play: Play,
  plus: Plus,
  puzzle: Puzzle,
  repeat: Repeat,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  route: Route,
  save: Save,
  search: Search,
  settings: Settings,
  'settings-2': Settings2,
  shield: Shield,
  'shield-check': ShieldCheck,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  sliders: SlidersHorizontal,
  smile: Smile,
  sparkles: Sparkles,
  sprout: Sprout,
  star: Star,
  stethoscope: Stethoscope,
  'sticky-note': StickyNote,
  sun: Sun,
  sunrise: Sunrise,
  tag: Tag,
  target: Target,
  timer: Timer,
  trash: Trash2,
  'trending-up': TrendingUp,
  trophy: Trophy,
  undo: Undo2,
  redo: Redo2,
  unlink: Unlink,
  users: Users,
  utensils: Utensils,
  'volume-high': Volume2,
  'volume-off': VolumeX,
  wallet: Wallet,
  waves: Waves,
  wrench: Wrench,
  x: X,
  zap: Zap,
} satisfies Record<string, IconComponent>;

export type IconKey = keyof typeof ICON_MAP;

interface DynamicIconProps {
  name?: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
  fallback?: IconKey;
}

// بيرندر أيقونة Lucide لو الاسم متعرّف في ICON_MAP. لو القيمة مش معروفة (مثلاً
// إيموجي قديم اتخزّن قبل التحديث ده، أو نص حر كتبه المستخدم في مجال حياة)،
// بيرجع النص الخام زي ما هو من غير ما يكسر حاجة — توافقية مع بيانات قديمة.
//
// ملاحظة مهمة: لو الاسم مفقود تمامًا (undefined/null/فاضي) — وده بيحصل كتير
// لعناصر قديمة اتخزّنت قبل ما ميزة الأيقونات دي تتضاف، أو تصنيفات المستخدم
// المخصّصة اللي متسجّلش لها أيقونة — كنا قبل كده بنرجّع null، يعني الزرار
// بيظهر فاضي تمامًا (مربّع بلا أيقونة). عشان كده لو مفيش name ولا fallback
// اتبعت، بنستخدم أيقونة افتراضية (tag) بدل ما نسيب الزرار فاضي.
const DEFAULT_ICON_KEY: IconKey = 'tag';

// ملاحظة عن الحجم: بنبعت الحجم كـ inline style (width/height بالبكسل) مش
// بس كـ خاصية SVG عادية. السبب: خاصية width/height في وسم <svg> بتتحول من
// المتصفح لـ "presentational hint" له أولوية أقل من أي قاعدة CSS في أي
// stylesheet — حتى لو القاعدة عامة زي `svg { height: auto }`. الموقع فيه
// قاعدة عامة زي دي (شوف "Responsive safety net" في styles.css) كانت بتلغي
// حجم الأيقونة الفعلي وتخليه "auto"، وده اللي كان بيخلي أيقونات معيّنة
// (زي القلب والبحث والتكرار) تظهر فاضية تمامًا في بعض المتصفحات/الـ webview
// من غير أي شكل جواها. inline style ليها أولوية أعلى من أي قاعدة في أي
// stylesheet (غير !important)، فبتضمن إن الأيقونة تفضل بحجمها الصح دايمًا
// أيًا كانت قواعد الـ CSS التانية في الصفحة — ده الحل النهائي/الدائم لمشكلة
// "الأيقونة الفاضية".
export function DynamicIcon({ name, size = 18, strokeWidth, className, fallback, ...rest }: DynamicIconProps) {
  const trimmed = typeof name === 'string' ? name.trim() : name;
  const key = (trimmed || fallback || DEFAULT_ICON_KEY) as IconKey;
  const Icon = ICON_MAP[key];
  if (!Icon) {
    // القيمة موجودة لكنها مش معروفة في الخريطة (إيموجي/نص حر) — نعرضها خام.
    return trimmed ? (
      <span className={className} aria-hidden="true">
        {trimmed}
      </span>
    ) : null;
  }
  const iconStyle: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    flexShrink: 0,
  };
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={iconStyle}
      aria-hidden={rest['aria-hidden'] !== false}
    />
  );
}

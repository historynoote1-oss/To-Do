import { useEffect, useRef, useState } from 'react';
import {
  getLists,
  createList,
  deleteList,
  getSiteStatus,
  getProfile,
  resolveAvatarUrl,
  getDueReminders,
  getLifeAreas,
  getArchive,
  MaintenanceError,
  SiteStatus,
  Reminder,
} from './lib/api';
import { sounds } from './lib/sounds';
import { toast } from './lib/toast';
import { getPushState, enablePush, disablePush, PushSupportState, PushError } from './lib/push';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import Profile from './components/Profile';
import LifeAreasManager from './components/LifeAreasManager';
import RecurringTasksManager from './components/RecurringTasksManager';
import ArchivePage from './components/Archive';
import MaintenancePage from './components/MaintenancePage';
import ToastContainer from './components/ToastContainer';
import ThemeToggle from './components/ThemeToggle';
import SideMenu from './components/SideMenu';
import ConfirmModal from './components/ConfirmModal';
import AddTaskModal from './components/AddTaskModal';
import { PriorityKey } from './lib/priority';
import { CategoryKey } from './lib/category';
import { LifeAreaData } from './lib/lifeArea';
import { groupByLifeArea, urgentLists, isListDone, NO_LIFE_AREA_GROUP } from './lib/organize';
import { DynamicIcon } from './lib/icons';
import TaskDistributionCard from './components/TaskDistributionCard';
import CompletionRateCard from './components/CompletionRateCard';

interface List {
  id: string;
  title: string;
  priority?: string;
  startTime?: string | null;
  endTime?: string | null;
  category?: string | null;
  targetYear?: number | null;
  lifeAreaId?: string | null;
  lifeArea?: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null } | null;
  recurringTaskId?: string | null;
  items: any[];
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [view, setView] = useState<'todos' | 'admin' | 'profile' | 'lifeAreas' | 'archive' | 'recurring'>('todos');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [highlightedListId, setHighlightedListId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [pushState, setPushState] = useState<PushSupportState>('unsupported');
  const [lifeAreas, setLifeAreas] = useState<LifeAreaData[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<'overview' | 'analytics' | 'users' | 'content' | 'settings' | 'security'>('overview');
  const shownReminderIds = useRef<Set<string>>(new Set());

  // زرار الكتم في الهيدر لازم يفضل متزامن حتى لو الكتم اتغيّر من صفحة
  // إعدادات الصوت في البروفايل.
  useEffect(() => {
    return sounds.subscribe(({ muted: m }) => setMuted(m));
  }, []);

  useEffect(() => {
    if (username) {
      refresh();
      refreshLifeAreas();
      refreshArchiveCount();
      getProfile()
        .then((data) => {
          setDisplayName(data.profile.displayName);
          setAvatarUrl(data.profile.avatarUrl);
        })
        .catch(() => {
          // اسم العرض والأفتار تجميليين بس، لو فشل الطلب نسيب اسم المستخدم
          // العادي وحرفه الأول يظهروا بدلهم
        });
    } else {
      setLoading(false);
    }
  }, [username]);

  async function refreshLifeAreas() {
    try {
      const data = await getLifeAreas();
      setLifeAreas(data);
    } catch {
      // مجالات الحياة تحسينية — لو فشل تحميلها منسيبش الموقع كله يتعطل بسببها
    }
  }

  // بنجيب عدد المهام المؤرشفة بس (من غير تفاصيلها) عشان نعرضه كإحصائية سريعة
  // فوق، وبنعيد جلبه بعد أي refresh() للمهام النشطة عشان يفضل متزامن مع أي
  // أرشفة/استرجاع تلقائي حصل في السيرفر.
  async function refreshArchiveCount() {
    try {
      const data = await getArchive();
      setArchiveCount(data.length);
    } catch {
      // إحصائية تجميلية بس — مفيش داعي نزعج المستخدم لو فشلت
    }
  }

  // بنتأكد من حالة الموقع (وضع الصيانة) أول ما التطبيق يفتح، وبعدين كل 15
  // ثانية طول الوقت — عشان أي مستخدم واقف في صفحة الصيانة يرجعله الموقع
  // تلقائيًا فور ما الأدمن يلغي الصيانة، من غير ما يحتاج يعمل refresh بنفسه.
  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        const status = await getSiteStatus();
        if (!cancelled) setSiteStatus(status);
      } catch {
        // لو السيرفر مش راجع رد أصلًا، الأفضل نسيب المستخدم يكمل بدل ما نقفل
        // عليه الوصول بالغلط بسبب مشكلة شبكة عابرة.
      } finally {
        if (!cancelled) setStatusChecked(true);
      }
    }
    checkStatus();
    const interval = window.setInterval(checkStatus, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // بنجيب حالة اشتراك إشعارات الجهاز أول ما المستخدم يسجّل دخول، بدون ما
  // نطلب إذن تلقائيًا — بس عشان نعرف نعرض زرار "تفعيل" أو "مفعّل" صح.
  useEffect(() => {
    if (!username) return;
    getPushState().then(setPushState);
  }, [username]);

  // استقصاء التذكيرات المستحقة كل 15 ثانية: الجدولة في السيرفر هي اللي
  // بتحدد فعليًا امتى التذكير "استحق" وتبعت إشعار الجهاز، وهنا بس بنعرض
  // إشعار داخل الموقع (toast + صوت) لأي تذكير استحق حديثًا لسه ماعرضناهوش
  // في الجلسة دي، عشان المستخدم ياخد تنبيه واضح حتى لو التاب فاتح قدامه.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function poll() {
      try {
        const due = await getDueReminders();
        if (cancelled) return;
        const fresh = due.filter((r: Reminder) => !shownReminderIds.current.has(r.id));
        if (fresh.length > 0) {
          sounds.reminder();
          fresh.forEach((r: Reminder) => {
            shownReminderIds.current.add(r.id);
            toast.reminder(r.message?.trim() || 'عندك مهمة محتاجة انتباهك دلوقتي');
          });
        }
      } catch {
        // فشل الاستقصاء (مشكلة شبكة عابرة) مش لازم يزعج المستخدم بـ toast خطأ
      }
    }

    poll();
    const interval = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [username]);

  async function handleTogglePush() {
    if (pushState === 'unsupported') {
      toast.error('الجهاز أو المتصفح ده مش بيدعم إشعارات الجهاز');
      return;
    }
    if (pushState === 'denied') {
      toast.error('إذن الإشعارات متمنوع من إعدادات المتصفح — لازم تفعّله من هناك الأول');
      return;
    }
    if (pushState === 'subscribed') {
      await disablePush();
      setPushState('default');
      sounds.notify();
      toast.info('اتلغى تفعيل إشعارات الجهاز');
      return;
    }
    try {
      await enablePush();
      setPushState('subscribed');
      toast.success('اتفعّلت إشعارات الجهاز');
      sounds.success();
    } catch (err) {
      if (err instanceof PushError && err.code === 'permission_denied') {
        setPushState('denied');
      }
      const message = err instanceof PushError ? err.message : 'تعذّر تفعيل إشعارات الجهاز — حصل خطأ غير متوقع';
      if (!(err instanceof PushError)) {
        console.error('[push] unexpected error while enabling push:', err);
      }
      toast.error(message);
    }
  }

  async function refresh() {
    try {
      const data = await getLists();
      setLists(data);
      refreshArchiveCount();
    } catch (err) {
      if (err instanceof MaintenanceError) {
        setSiteStatus((prev) => (prev ? { ...prev, maintenanceMode: true, maintenanceMessage: err.message } : prev));
        return;
      }
      toast.error(err instanceof Error ? err.message : 'حصل خطأ في تحميل المهام الرئيسية');
    } finally {
      setLoading(false);
    }
  }

  function handleAuthSuccess(name: string, admin: boolean) {
    localStorage.setItem('username', name);
    localStorage.setItem('isAdmin', String(admin));
    setUsername(name);
    setIsAdmin(admin);
    setLoading(true);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    setUsername(null);
    setIsAdmin(false);
    setDisplayName(null);
    setAvatarUrl(null);
    setLists([]);
    setLifeAreas([]);
    sounds.click();
  }

  // بدل ما زرار الخروج يسجّل خروج فورًا، بنفتح نافذة تأكيد الأول عشان
  // نتجنب أي خروج بالغلط بضغطة واحدة.
  function requestLogout() {
    setLogoutConfirmOpen(true);
  }

  function confirmLogout() {
    setLogoutConfirmOpen(false);
    handleLogout();
  }

  // اختصار "إعدادات الموقع" من القائمة الجانبية بيودّي مباشرة لتبويب
  // الإعدادات جوه لوحة التحكم، بدل ما الأدمن يفتح اللوحة ويدور عليه.
  function openSiteSettings() {
    setAdminInitialTab('settings');
    setView('admin');
  }

  function openDashboard() {
    setAdminInitialTab('overview');
    setView('admin');
  }

  function handleToggleMute() {
    setMuted(sounds.toggleMuted());
  }

  async function handleCreate(data: {
    title: string;
    priority: PriorityKey;
    category: CategoryKey | null;
    targetYear: number | null;
    lifeAreaId: string | null;
  }) {
    const { title, priority, category, targetYear, lifeAreaId } = data;
    sounds.addItem();
    // تحديث تفاؤلي: المهمة الرئيسية بتظهر فورًا من غير ما ننتظر السيرفر
    const tempId = `temp-${Date.now()}`;
    setLists((prev) => [...prev, { id: tempId, title, priority, category, targetYear, lifeAreaId, items: [] }]);
    try {
      await createList(title, priority, category, targetYear, lifeAreaId);
      await refresh();
      toast.success(`"${title}" اتضافت بنجاح`);
    } catch (err) {
      setLists((prev) => prev.filter((l) => l.id !== tempId));
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء المهمة الرئيسية');
    }
  }

  async function handleDelete(id: string) {
    const snapshot = lists;
    sounds.deleteItem();
    setLists((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteList(id);
    } catch (err) {
      setLists(snapshot);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة الرئيسية');
    }
  }

  // بيودّي الشاشة لأي قسم (عاجل / مجال حياة معيّن) بالاسكرول الناعم — ده
  // تنقّل بس (مش فلترة)، فمفيش أي مهمة بتختفي، بس بيوصلك لمكانها بثانية.
  function scrollToSection(sectionId: string) {
    sounds.click();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // اختصار من بطاقات الإحصائيات: بيوديك لأول مهمة رئيسية غير مكتملة من
  // نفس التصنيف ويضيء حواليها لثانيتين، بدل ما يخفي باقي المهام بفلتر.
  function jumpToCategory(key: CategoryKey) {
    const target = lists.find((l) => l.category === key && !isListDone(l as any));
    if (!target) {
      sounds.error();
      toast.info('مفيش مهمة رئيسية غير مكتملة من التصنيف ده حاليًا');
      return;
    }
    sounds.click();
    setHighlightedListId(target.id);
    document.getElementById(`list-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedListId(null), 2200);
  }

  const blockedByMaintenance = !!siteStatus?.maintenanceMode && !isAdmin;

  // ملاحظة: القائمة النشطة (lists) بترجع من السيرفر من غير أي مهمة اكتملت
  // بالكامل، لأنها بتتؤرشف تلقائيًا وتتنقل لصفحة الأرشيف — فمفيش داعي لتبويب
  // "مكتملة" هنا تاني، "نشطة" هي كل حاجة موجودة أصلًا.
  // التنظيم الجديد: بدل فلترة يدوية مستمرة، المهام بتترتب تلقائيًا حسب
  // الأولوية وتتجمّع حسب مجال الحياة — قسم "عاجل الآن" بيوفّر وصول فوري
  // لأهم المهام من غير ما يحتاج المستخدم يدوّر أو يفعّل أي فلتر.
  const urgent = urgentLists(lists as any, 6);
  const groups = groupByLifeArea(lists as any, lifeAreas);

  if (!statusChecked) {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <div className="app-boot" aria-hidden="true">
          <span className="app-boot-spinner" />
        </div>
      </>
    );
  }

  if (blockedByMaintenance) {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <MaintenancePage
          emoji={siteStatus?.maintenanceEmoji || 'wrench'}
          message={siteStatus?.maintenanceMessage || 'الموقع تحت الصيانة حاليًا، هنرجع قريب'}
          siteName={siteStatus?.siteName || 'الموقع'}
          onAdminSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  if (!username) {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <div className="auth-shell view-fade">
          <div className="auth-shell-brand">
            <DynamicIcon name="clipboard-list" size={22} className="auth-shell-mark" />
            <h2 className="auth-shell-name">قائمة المهام</h2>
            <p className="auth-shell-tagline">مساحتك لتنظيم مهامك، بتصميم بسيط وسريع يخليك تركّز على اللي محتاج تخلّصه.</p>
            <ul className="auth-shell-points">
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                قوائم رئيسية ومهام فرعية بترتيب أولويات واضح
              </li>
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                تتبّع تقدمك بنسب مئوية ومؤشرات حية
              </li>
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                حماية بخطوتين وكود استرجاع لحسابك
              </li>
            </ul>
          </div>
          <div className="auth-shell-form">
            <AuthForm onSuccess={handleAuthSuccess} />
          </div>
        </div>
      </>
    );
  }

  if (view === 'admin') {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <div className="view-fade">
          <AdminDashboard onBack={() => setView('todos')} initialTab={adminInitialTab} />
        </div>
      </>
    );
  }

  if (view === 'profile') {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <Profile
          onBack={() => setView('todos')}
          onDisplayNameChange={setDisplayName}
          onAvatarChange={setAvatarUrl}
        />
      </>
    );
  }

  if (view === 'lifeAreas') {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <LifeAreasManager
          onBack={() => setView('todos')}
          onChange={() => {
            refreshLifeAreas();
            refresh();
          }}
        />
      </>
    );
  }

  if (view === 'archive') {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <ArchivePage onBack={() => setView('todos')} onChange={refresh} />
      </>
    );
  }

  if (view === 'recurring') {
    return (
      <>
        <ToastContainer />
        <ThemeToggle />
        <RecurringTasksManager
          lifeAreas={lifeAreas}
          onBack={() => setView('todos')}
          onChange={refresh}
          onManageLifeAreas={() => setView('lifeAreas')}
        />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <ThemeToggle />
      <div className="container view-fade">
        {isAdmin && siteStatus?.maintenanceMode && (
          <div className="maintenance-banner">
            <span><DynamicIcon name="wrench" size={16} /> وضع الصيانة مفعّل حاليًا — المستخدمين العاديين مش شايفين الموقع غيرك.</span>
            <button className="small" onClick={() => setView('admin')} type="button">
              إدارة الإعدادات
            </button>
          </div>
        )}
        <div className="top-bar">
          <div className="top-bar-main">
            <div className="brand">
              <DynamicIcon name="clipboard-list" size={22} className="brand-mark" />
              <div className="brand-text">
                <h1>المهام الرئيسية</h1>
                <span className="brand-subtitle">مساحتك لتنظيم مهامك اليومية</span>
              </div>
            </div>
            <div className="top-bar-actions">
              <button
                className="user-chip user-chip-button"
                onClick={() => setView('profile')}
                type="button"
                title="الملف الشخصي"
              >
                <span className="user-chip-avatar">
                  {avatarUrl ? (
                    <img src={resolveAvatarUrl(avatarUrl) ?? undefined} alt="" />
                  ) : (
                    (displayName || username)?.trim().charAt(0).toUpperCase()
                  )}
                </span>
                <span className="user-chip-name">{displayName || username}</span>
              </button>
              <button
                className="icon-btn hamburger-btn"
                onClick={() => setMenuOpen(true)}
                type="button"
                title="القائمة"
                aria-label="فتح القائمة"
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                <span className="hamburger-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </div>
        </div>

        <SideMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          isAdmin={isAdmin}
          archiveCount={archiveCount}
          muted={muted}
          pushState={pushState}
          onOpenDashboard={openDashboard}
          onOpenArchive={() => setView('archive')}
          onOpenLifeAreas={() => setView('lifeAreas')}
          onOpenRecurring={() => setView('recurring')}
          onOpenSiteSettings={openSiteSettings}
          onToggleMute={handleToggleMute}
          onTogglePush={handleTogglePush}
          onRequestLogout={requestLogout}
        />

        {logoutConfirmOpen && (
          <ConfirmModal
            title="تسجيل الخروج"
            description="هتحتاج تسجّل دخول تاني عشان تكمل شغلك. متأكد إنك عايز تخرج؟"
            confirmLabel="تسجيل الخروج"
            cancelLabel="إلغاء"
            danger
            onCancel={() => setLogoutConfirmOpen(false)}
            onConfirm={confirmLogout}
          />
        )}

        <div className="stats-row">
          <TaskDistributionCard lists={lists} onSelectCategory={jumpToCategory} />
          <CompletionRateCard lists={lists} onSelectCategory={jumpToCategory} />
          <button className="stat-card stat-card-button" onClick={() => setView('archive')} type="button">
            <span className="stat-card-value stat-card-success">{archiveCount}</span>
            <span className="stat-card-label"><DynamicIcon name="archive" size={14} /> في الأرشيف</span>
          </button>
        </div>

        <button className="add-task-cta" onClick={() => setAddTaskOpen(true)} type="button">
          <span className="add-task-cta-icon">
            <DynamicIcon name="plus" size={20} />
          </span>
          <span className="add-task-cta-text">
            <strong>إضافة مهمة رئيسية جديدة</strong>
            <span>اسم، أولوية، تصنيف، ومجال حياة — في نافذة واحدة مرتبة</span>
          </span>
        </button>

        <button className="add-task-cta recurring-cta" onClick={() => setView('recurring')} type="button">
          <span className="add-task-cta-icon recurring-cta-icon">
            <DynamicIcon name="repeat" size={20} />
          </span>
          <span className="add-task-cta-text">
            <strong>مهمة متكررة جديدة</strong>
            <span>يوميًا، أسبوعيًا، شهريًا، أو سنويًا — وهي بتتولّد لوحدها</span>
          </span>
        </button>

        <AddTaskModal
          open={addTaskOpen}
          lifeAreas={lifeAreas}
          onClose={() => setAddTaskOpen(false)}
          onManageLifeAreas={() => {
            setAddTaskOpen(false);
            setView('lifeAreas');
          }}
          onCreate={handleCreate}
        />

        {loading && (
          <div className="lists-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        )}

        {!loading && lists.length === 0 && (
          <p className="empty">
            <DynamicIcon name="sticky-note" size={32} className="empty-icon" />
            مفيش مهام رئيسية لسه، ابدأ بإنشاء أول مهمة
          </p>
        )}

        {!loading && lists.length > 0 && (groups.length > 1 || urgent.length > 0) && (
          <nav className="quick-nav" aria-label="تنقّل سريع بين الأقسام">
            {urgent.length > 0 && (
              <button className="quick-nav-chip quick-nav-urgent" onClick={() => scrollToSection('section-urgent')} type="button">
                <DynamicIcon name="alert" size={13} /> عاجل الآن
                <span className="quick-nav-count">{urgent.length}</span>
              </button>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                className="quick-nav-chip"
                style={{ ['--chip-color' as any]: g.color }}
                onClick={() => scrollToSection(`section-area-${g.id}`)}
                type="button"
              >
                <DynamicIcon name={(g.icon as any) || 'tag'} size={13} /> {g.name}
                <span className="quick-nav-count">{g.lists.length}</span>
              </button>
            ))}
          </nav>
        )}

        {!loading && urgent.length > 0 && (
          <section id="section-urgent" className="task-section task-section-urgent">
            <div className="task-section-header">
              <h3>
                <DynamicIcon name="alert" size={16} /> عاجل الآن
              </h3>
              <span className="task-section-count">{urgent.length}</span>
            </div>
            <p className="task-section-hint">أعلى أولوية أو أقرب موعد استحقاق — دي أول حاجة تستاهل وقتك</p>
            <div className="lists-grid">
              {urgent.map((list, i) => (
                <TodoList
                  key={`urgent-${list.id}`}
                  list={list}
                  onChange={refresh}
                  onDeleteList={handleDelete}
                  delay={i * 60}
                  lifeAreas={lifeAreas}
                  onManageLifeAreas={() => setView('lifeAreas')}
                />
              ))}
            </div>
          </section>
        )}

        {!loading &&
          groups.map((group) => (
            <section id={`section-area-${group.id}`} className="task-section" key={group.id}>
              <div className="task-section-header" style={{ ['--chip-color' as any]: group.color }}>
                <h3>
                  {group.id !== NO_LIFE_AREA_GROUP && (
                    <span className="task-section-dot" style={{ background: group.color }} />
                  )}
                  <DynamicIcon name={(group.icon as any) || 'tag'} size={16} />
                  {group.name}
                </h3>
                <span className="task-section-count">{group.lists.length}</span>
              </div>
              <div className="lists-grid">
                {group.lists.map((list, i) => (
                  <div id={`list-${list.id}`} key={list.id}>
                    <TodoList
                      list={list}
                      onChange={refresh}
                      onDeleteList={handleDelete}
                      delay={i * 60}
                      lifeAreas={lifeAreas}
                      onManageLifeAreas={() => setView('lifeAreas')}
                      highlighted={highlightedListId === list.id}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

        <button className="fab-add-task" onClick={() => setAddTaskOpen(true)} type="button" aria-label="إضافة مهمة رئيسية جديدة" title="إضافة مهمة رئيسية جديدة">
          <DynamicIcon name="plus" size={22} />
        </button>
      </div>
    </>
  );
}

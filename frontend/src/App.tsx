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
import { getPushState, enablePush, disablePush, PushSupportState } from './lib/push';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import Profile from './components/Profile';
import LifeAreasManager from './components/LifeAreasManager';
import ArchivePage from './components/Archive';
import MaintenancePage from './components/MaintenancePage';
import ToastContainer from './components/ToastContainer';
import ThemeToggle from './components/ThemeToggle';
import { PriorityPicker } from './components/Priority';
import { CategoryPicker } from './components/Category';
import { LifeAreaPicker } from './components/LifeArea';
import FilterBar from './components/FilterBar';
import FilterPanel from './components/FilterPanel';
import { PriorityKey } from './lib/priority';
import { CategoryKey } from './lib/category';
import { LifeAreaData } from './lib/lifeArea';
import {
  FilterCriteria,
  SavedFilter,
  addSavedFilter,
  defaultFilters,
  getSavedFilters,
  matchesFilters,
  removeSavedFilter,
} from './lib/filters';

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
  items: any[];
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [view, setView] = useState<'todos' | 'admin' | 'profile' | 'lifeAreas' | 'archive'>('todos');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [filters, setFilters] = useState<FilterCriteria>(() => defaultFilters());
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<PriorityKey>('NONE');
  const [newCategory, setNewCategory] = useState<CategoryKey | null>(null);
  const [newTargetYear, setNewTargetYear] = useState<number | null>(null);
  const [newLifeAreaId, setNewLifeAreaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [pushState, setPushState] = useState<PushSupportState>('unsupported');
  const [lifeAreas, setLifeAreas] = useState<LifeAreaData[]>([]);
  const shownReminderIds = useRef<Set<string>>(new Set());

  // زرار الكتم في الهيدر لازم يفضل متزامن حتى لو الكتم اتغيّر من صفحة
  // إعدادات الصوت في البروفايل.
  useEffect(() => {
    return sounds.subscribe(({ muted: m }) => setMuted(m));
  }, []);

  useEffect(() => {
    if (username) {
      setSavedFilters(getSavedFilters(username));
    } else {
      setSavedFilters([]);
    }
  }, [username]);

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
    const ok = await enablePush();
    if (ok) {
      setPushState('subscribed');
      toast.success('اتفعّلت إشعارات الجهاز 🔔');
      sounds.success();
    } else {
      toast.error('تعذّر تفعيل إشعارات الجهاز');
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

  function handleToggleMute() {
    setMuted(sounds.toggleMuted());
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const title = newTitle.trim();
    const priority = newPriority;
    const category = newCategory;
    const targetYear = newCategory === 'YEARLY' ? newTargetYear : null;
    const lifeAreaId = newLifeAreaId;
    sounds.addItem();
    setNewTitle('');
    setNewPriority('NONE');
    setNewCategory(null);
    setNewTargetYear(null);
    setNewLifeAreaId(null);
    // تحديث تفاؤلي: المهمة الرئيسية بتظهر فورًا من غير ما ننتظر السيرفر
    const tempId = `temp-${Date.now()}`;
    setLists((prev) => [...prev, { id: tempId, title, priority, category, targetYear, lifeAreaId, items: [] }]);
    try {
      await createList(title, priority, category, targetYear, lifeAreaId);
      await refresh();
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

  function handleSaveFilter(name: string) {
    if (!username) return;
    const exists = savedFilters.some((f) => f.name.trim() === name.trim());
    if (exists) {
      toast.error('في فلتر محفوظ بنفس الاسم ده بالفعل');
      return;
    }
    setSavedFilters(addSavedFilter(username, name, filters));
    toast.success('اتحفظ الفلتر بنجاح');
  }

  function handleApplySavedFilter(f: SavedFilter) {
    sounds.click();
    setFilters(f.criteria);
  }

  function handleDeleteSavedFilter(id: string) {
    if (!username) return;
    setSavedFilters(removeSavedFilter(username, id));
    sounds.notify();
    toast.info('اتحذف الفلتر المحفوظ');
  }

  function handleResetFilters() {
    sounds.click();
    setFilters(defaultFilters());
  }

  const blockedByMaintenance = !!siteStatus?.maintenanceMode && !isAdmin;

  const totalLists = lists.length;
  const totalItems = lists.reduce((sum, l) => sum + l.items.length, 0);
  const doneItems = lists.reduce((sum, l) => sum + l.items.filter((i: any) => i.isDone).length, 0);

  // ملاحظة: القائمة النشطة (lists) بترجع من السيرفر من غير أي مهمة اكتملت
  // بالكامل، لأنها بتتؤرشف تلقائيًا وتتنقل لصفحة الأرشيف — فمفيش داعي لتبويب
  // "مكتملة" هنا تاني، "نشطة" هي كل حاجة موجودة أصلًا.
  const visibleLists = lists.filter((l) => matchesFilters(l, filters));

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
          emoji={siteStatus?.maintenanceEmoji || '🛠️'}
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
            <span className="auth-shell-mark" aria-hidden="true">📋</span>
            <h2 className="auth-shell-name">قائمة المهام</h2>
            <p className="auth-shell-tagline">مساحتك لتنظيم مهامك، بتصميم بسيط وسريع يخليك تركّز على اللي محتاج تخلّصه.</p>
            <ul className="auth-shell-points">
              <li>
                <span className="auth-shell-point-icon">✓</span>
                قوائم رئيسية ومهام فرعية بترتيب أولويات واضح
              </li>
              <li>
                <span className="auth-shell-point-icon">✓</span>
                تتبّع تقدمك بنسب مئوية ومؤشرات حية
              </li>
              <li>
                <span className="auth-shell-point-icon">✓</span>
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
          <AdminDashboard onBack={() => setView('todos')} />
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

  return (
    <>
      <ToastContainer />
      <ThemeToggle />
      <div className="container view-fade">
        {isAdmin && siteStatus?.maintenanceMode && (
          <div className="maintenance-banner">
            <span>🛠️ وضع الصيانة مفعّل حاليًا — المستخدمين العاديين مش شايفين الموقع غيرك.</span>
            <button className="small" onClick={() => setView('admin')} type="button">
              إدارة الإعدادات
            </button>
          </div>
        )}
        <div className="top-bar">
          <div className="top-bar-main">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">📋</span>
              <div className="brand-text">
                <h1>المهام الرئيسية</h1>
                <span className="brand-subtitle">مساحتك لتنظيم مهامك اليومية</span>
              </div>
            </div>
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
          </div>
          <div className="user-actions">
            <button
              className={`icon-btn ${muted ? '' : 'active'}`}
              onClick={handleToggleMute}
              title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
              aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            {pushState !== 'unsupported' && (
              <button
                className={`icon-btn ${pushState === 'subscribed' ? 'active' : ''}`}
                onClick={handleTogglePush}
                title={pushState === 'subscribed' ? 'إشعارات الجهاز مفعّلة' : 'تفعيل إشعارات الجهاز للتذكيرات'}
                aria-label="إشعارات الجهاز"
              >
                {pushState === 'subscribed' ? '🔔' : '🔕'}
              </button>
            )}
            <button className="small" onClick={() => setView('lifeAreas')} type="button" title="مجالات الحياة">
              🧭 مجالات الحياة
            </button>
            <button className="small" onClick={() => setView('archive')} type="button" title="الأرشيف">
              🗄️ الأرشيف{archiveCount > 0 ? ` (${archiveCount})` : ''}
            </button>
            {isAdmin && (
              <button className="small" onClick={() => setView('admin')}>
                لوحة التحكم
              </button>
            )}
            <button className="danger small" onClick={handleLogout}>
              خروج
            </button>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card-value">{totalLists}</span>
            <span className="stat-card-label">إجمالي المهام الرئيسية</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{doneItems}/{totalItems}</span>
            <span className="stat-card-label">مهام فرعية منجزة</span>
          </div>
          <button className="stat-card stat-card-button" onClick={() => setView('archive')} type="button">
            <span className="stat-card-value stat-card-success">{archiveCount}</span>
            <span className="stat-card-label">🗄️ في الأرشيف</span>
          </button>
        </div>

        <div className="new-list">
          <div className="new-list-row">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="اسم المهمة الرئيسية الجديدة"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button onClick={handleCreate}>إضافة مهمة رئيسية</button>
          </div>
          <div className="new-list-priority">
            <span className="new-list-priority-label">الأولوية:</span>
            <PriorityPicker value={newPriority} onChange={setNewPriority} />
          </div>
          <div className="new-list-priority">
            <span className="new-list-priority-label">التصنيف:</span>
            <CategoryPicker
              value={newCategory}
              targetYear={newTargetYear}
              onChange={(key, year) => {
                setNewCategory(key);
                setNewTargetYear(key === 'YEARLY' ? year ?? new Date().getFullYear() : null);
              }}
            />
          </div>
          <div className="new-list-priority">
            <span className="new-list-priority-label">مجال الحياة:</span>
            <LifeAreaPicker
              value={newLifeAreaId}
              areas={lifeAreas}
              onChange={setNewLifeAreaId}
              onManage={() => setView('lifeAreas')}
            />
          </div>
        </div>

        {loading && (
          <div className="lists-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        )}

        {!loading && lists.length === 0 && (
          <p className="empty">
            <span className="empty-icon">🗒️</span>
            مفيش مهام رئيسية لسه، ابدأ بإنشاء أول مهمة
          </p>
        )}

        {!loading && lists.length > 0 && (
          <>
            <FilterBar
              criteria={filters}
              lifeAreas={lifeAreas}
              savedFilters={savedFilters}
              resultCount={visibleLists.length}
              onOpenPanel={() => setFilterPanelOpen(true)}
              onChange={setFilters}
              onApplySaved={handleApplySavedFilter}
              onResetAll={handleResetFilters}
            />
            <FilterPanel
              open={filterPanelOpen}
              criteria={filters}
              lifeAreas={lifeAreas}
              savedFilters={savedFilters}
              resultCount={visibleLists.length}
              onChange={setFilters}
              onReset={handleResetFilters}
              onClose={() => setFilterPanelOpen(false)}
              onSave={handleSaveFilter}
              onApplySaved={handleApplySavedFilter}
              onDeleteSaved={handleDeleteSavedFilter}
            />
          </>
        )}

        {!loading && lists.length > 0 && visibleLists.length === 0 && (
          <p className="empty">
            <span className="empty-icon">🔍</span>
            مفيش قوائم مطابقة للفلتر ده حاليًا
          </p>
        )}

        {!loading && visibleLists.length > 0 && (
          <div className="lists-grid">
            {visibleLists.map((list, i) => (
              <TodoList
                key={list.id}
                list={list}
                onChange={refresh}
                onDeleteList={handleDelete}
                delay={i * 60}
                lifeAreas={lifeAreas}
                onManageLifeAreas={() => setView('lifeAreas')}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

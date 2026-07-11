import { useEffect, useState } from 'react';
import {
  getLists,
  createList,
  deleteList,
  getSiteStatus,
  getProfile,
  resolveAvatarUrl,
  MaintenanceError,
  SiteStatus,
} from './lib/api';
import { sounds } from './lib/sounds';
import { toast } from './lib/toast';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import Profile from './components/Profile';
import MaintenancePage from './components/MaintenancePage';
import ToastContainer from './components/ToastContainer';
import { PriorityPicker } from './components/Priority';
import { PriorityKey } from './lib/priority';

interface List {
  id: string;
  title: string;
  priority?: string;
  items: any[];
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [view, setView] = useState<'todos' | 'admin' | 'profile'>('todos');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<PriorityKey>('NONE');
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    if (username) {
      refresh();
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

  async function refresh() {
    try {
      const data = await getLists();
      setLists(data);
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
    sounds.click();
  }

  function handleToggleMute() {
    setMuted(sounds.toggleMuted());
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const title = newTitle.trim();
    const priority = newPriority;
    sounds.addItem();
    setNewTitle('');
    setNewPriority('NONE');
    // تحديث تفاؤلي: المهمة الرئيسية بتظهر فورًا من غير ما ننتظر السيرفر
    const tempId = `temp-${Date.now()}`;
    setLists((prev) => [...prev, { id: tempId, title, priority, items: [] }]);
    try {
      await createList(title, priority);
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

  const blockedByMaintenance = !!siteStatus?.maintenanceMode && !isAdmin;

  const totalLists = lists.length;
  const completedLists = lists.filter((l) => l.items.length > 0 && l.items.every((i: any) => i.isDone)).length;
  const totalItems = lists.reduce((sum, l) => sum + l.items.length, 0);
  const doneItems = lists.reduce((sum, l) => sum + l.items.filter((i: any) => i.isDone).length, 0);

  const visibleLists = lists.filter((l) => {
    if (filter === 'all') return true;
    const isDone = l.items.length > 0 && l.items.every((i: any) => i.isDone);
    return filter === 'completed' ? isDone : !isDone;
  });

  if (!statusChecked) {
    return (
      <>
        <ToastContainer />
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
        <Profile
          onBack={() => setView('todos')}
          onDisplayNameChange={setDisplayName}
          onAvatarChange={setAvatarUrl}
        />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
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
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">📋</span>
            <div className="brand-text">
              <h1>المهام الرئيسية</h1>
              <span className="brand-subtitle">مساحتك لتنظيم مهامك اليومية</span>
            </div>
          </div>
          <div className="user-info">
            <div className="user-actions">
              <button
                className={`icon-btn ${muted ? '' : 'active'}`}
                onClick={handleToggleMute}
                title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
                aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
              >
                {muted ? '🔇' : '🔊'}
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
            <span className="user-info-divider" aria-hidden="true" />
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
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-card-value">{totalLists}</span>
            <span className="stat-card-label">إجمالي المهام الرئيسية</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value stat-card-success">{completedLists}</span>
            <span className="stat-card-label">مكتملة بالكامل</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{doneItems}/{totalItems}</span>
            <span className="stat-card-label">مهام فرعية منجزة</span>
          </div>
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
          <div className="list-toolbar">
            <div className="section-heading">قوائمك ({visibleLists.length})</div>
            <div className="filter-tabs" role="tablist" aria-label="فلترة القوائم">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
              >
                الكل
              </button>
              <button
                className={filter === 'active' ? 'active' : ''}
                onClick={() => setFilter('active')}
                type="button"
                role="tab"
                aria-selected={filter === 'active'}
              >
                نشطة
              </button>
              <button
                className={filter === 'completed' ? 'active' : ''}
                onClick={() => setFilter('completed')}
                type="button"
                role="tab"
                aria-selected={filter === 'completed'}
              >
                مكتملة
              </button>
            </div>
          </div>
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
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

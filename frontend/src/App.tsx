import { useEffect, useState } from 'react';
import { getLists, createList, deleteList, getSiteStatus, MaintenanceError, SiteStatus } from './lib/api';
import { sounds } from './lib/sounds';
import { toast } from './lib/toast';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import MaintenancePage from './components/MaintenancePage';
import ToastContainer from './components/ToastContainer';
import ResetPasswordPage from './components/ResetPasswordPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import { PriorityPicker } from './components/Priority';
import { PriorityKey } from './lib/priority';

interface List {
  id: string;
  title: string;
  priority?: string;
  items: any[];
}

export default function App() {
  // روابط الإيميل (استرجاع كلمة المرور / تأكيد الإيميل) بتوصل على نفس الصفحة
  // الرئيسية مع query param، مش مسار منفصل — عشان محتاجناش أي مكتبة routing
  // ولا إعداد rewrite إضافي على Vercel. بنقراها مرة واحدة بس عند فتح الصفحة.
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken'));
  const [verifyToken] = useState(() => new URLSearchParams(window.location.search).get('verifyToken'));
  const [tokenPageDismissed, setTokenPageDismissed] = useState(false);

  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [view, setView] = useState<'todos' | 'admin'>('todos');
  const [lists, setLists] = useState<List[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<PriorityKey>('NONE');
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    if (username) refresh();
    else setLoading(false);
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

  function clearTokenFromUrl() {
    setTokenPageDismissed(true);
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (resetToken && !tokenPageDismissed) {
    return (
      <>
        <ToastContainer />
        <div className="view-fade">
          <ResetPasswordPage token={resetToken} onDone={clearTokenFromUrl} />
        </div>
      </>
    );
  }

  if (verifyToken && !tokenPageDismissed) {
    return (
      <>
        <ToastContainer />
        <div className="view-fade">
          <VerifyEmailPage token={verifyToken} onDone={clearTokenFromUrl} />
        </div>
      </>
    );
  }

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
        <div className="view-fade">
          <AuthForm onSuccess={handleAuthSuccess} />
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
          <h1>المهام الرئيسية</h1>
          <div className="user-info">
            <span>مرحبًا، {username}</span>
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

        {!loading && (
          <div className="lists-grid">
            {lists.map((list, i) => (
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

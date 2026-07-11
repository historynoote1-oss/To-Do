import { useEffect, useState } from 'react';
import { getLists, createList, deleteList } from './lib/api';
import { sounds } from './lib/sounds';
import { toast } from './lib/toast';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import UpdatesLog from './components/UpdatesLog';
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
  const [view, setView] = useState<'todos' | 'admin' | 'updates'>('todos');
  const [lists, setLists] = useState<List[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<PriorityKey>('NONE');
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());

  useEffect(() => {
    if (username) refresh();
    else setLoading(false);
  }, [username]);

  async function refresh() {
    try {
      const data = await getLists();
      setLists(data);
    } catch (err) {
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

  if (view === 'updates') {
    return (
      <>
        <ToastContainer />
        <div className="view-fade">
          <UpdatesLog onBack={() => setView('todos')} />
        </div>
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
        <button className="updates-fab" onClick={() => setView('updates')}>
          📢 التحديثات
        </button>
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
            <button className="small" onClick={() => setView('updates')}>
              📢 التحديثات
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

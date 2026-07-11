import { useEffect, useState } from 'react';
import { getLists, createList, deleteList } from './lib/api';
import { sounds } from './lib/sounds';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import UpdatesLog from './components/UpdatesLog';

interface List {
  id: string;
  title: string;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (username) refresh();
  }, [username]);

  async function refresh() {
    try {
      const data = await getLists();
      setLists(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ');
    }
  }

  function handleAuthSuccess(name: string, admin: boolean) {
    localStorage.setItem('username', name);
    localStorage.setItem('isAdmin', String(admin));
    setUsername(name);
    setIsAdmin(admin);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    setUsername(null);
    setIsAdmin(false);
    setLists([]);
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    sounds.addItem();
    await createList(newTitle.trim());
    setNewTitle('');
    await refresh();
  }

  async function handleDelete(id: string) {
    sounds.deleteItem();
    await deleteList(id);
    await refresh();
  }

  if (view === 'updates') {
    return <UpdatesLog onBack={() => setView('todos')} />;
  }

  if (!username) {
    return (
      <>
        <AuthForm onSuccess={handleAuthSuccess} />
        <button className="updates-fab" onClick={() => setView('updates')}>
          📢 التحديثات
        </button>
      </>
    );
  }

  if (view === 'admin') {
    return <AdminDashboard onBack={() => setView('todos')} />;
  }

  return (
    <div className="container">
      <div className="top-bar">
        <h1>قائمة المهام</h1>
        <div className="user-info">
          <span>مرحبًا، {username}</span>
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

      {error && <p className="error">{error}</p>}

      <div className="new-list">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="اسم قائمة جديدة"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>إضافة قائمة</button>
      </div>

      {lists.length === 0 && <p className="empty">مفيش قوائم لسه، ابدأ بإنشاء واحدة</p>}
      <div className="lists-grid">
        {lists.map((list) => (
          <TodoList key={list.id} list={list} onChange={refresh} onDeleteList={handleDelete} />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getLists, createList, deleteList } from './lib/api';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';

interface List {
  id: string;
  title: string;
  items: any[];
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
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

  function handleAuthSuccess(name: string) {
    localStorage.setItem('username', name);
    setUsername(name);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUsername(null);
    setLists([]);
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    await createList(newTitle.trim());
    setNewTitle('');
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteList(id);
    await refresh();
  }

  if (!username) {
    return <AuthForm onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="container">
      <div className="top-bar">
        <h1>قائمة المهام</h1>
        <div className="user-info">
          <span>مرحبًا، {username}</span>
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
      {lists.map((list) => (
        <TodoList key={list.id} list={list} onChange={refresh} onDeleteList={handleDelete} />
      ))}
    </div>
  );
}

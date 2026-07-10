import { useEffect, useState } from 'react';
import { setupDiscordAuth } from './lib/discord';
import { getLists, createList, deleteList } from './lib/api';
import TodoList from './components/TodoList';

interface List {
  id: string;
  title: string;
  items: any[];
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await setupDiscordAuth();
        setReady(true);
        await refresh();
      } catch (err) {
        console.error(err);
        setError('حصل خطأ في الاتصال بـ Discord');
      }
    })();
  }, []);

  async function refresh() {
    const data = await getLists();
    setLists(data);
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

  if (error) return <div className="container error">{error}</div>;
  if (!ready) return <div className="container">جاري التحميل...</div>;

  return (
    <div className="container">
      <h1>قائمة المهام</h1>
      <div className="new-list">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="اسم قائمة جديدة"
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

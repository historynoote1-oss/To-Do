import { useState } from 'react';
import { addItem, toggleItem, deleteItem } from '../lib/api';
import { sounds } from '../lib/sounds';
import TodoItemRow from './TodoItem';

export default function TodoList({ list, onChange, onDeleteList }: any) {
  const [newItem, setNewItem] = useState('');

  const total = list.items.length;
  const done = list.items.filter((i: any) => i.isDone).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  async function handleAdd() {
    if (!newItem.trim()) return;
    sounds.addItem();
    await addItem(list.id, newItem.trim());
    setNewItem('');
    onChange();
  }

  function handleDeleteList() {
    sounds.deleteItem();
    onDeleteList(list.id);
  }

  return (
    <div className="list-card">
      <div className="list-header">
        <h2>{list.title}</h2>
        <button className="danger small" onClick={handleDeleteList}>
          حذف القائمة
        </button>
      </div>

      {total > 0 && (
        <div className="list-progress">
          <div className="list-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="new-item">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="مهمة جديدة"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}>+</button>
      </div>
      <ul>
        {list.items.map((item: any) => (
          <TodoItemRow
            key={item.id}
            item={item}
            onToggle={async () => {
              await toggleItem(item.id, !item.isDone);
              onChange();
            }}
            onDelete={async () => {
              await deleteItem(item.id);
              onChange();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

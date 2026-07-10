import { useState } from 'react';
import { addItem, toggleItem, deleteItem } from '../lib/api';
import TodoItemRow from './TodoItem';

export default function TodoList({ list, onChange, onDeleteList }: any) {
  const [newItem, setNewItem] = useState('');

  async function handleAdd() {
    if (!newItem.trim()) return;
    await addItem(list.id, newItem.trim());
    setNewItem('');
    onChange();
  }

  return (
    <div className="list-card">
      <div className="list-header">
        <h2>{list.title}</h2>
        <button className="danger" onClick={() => onDeleteList(list.id)}>
          حذف القائمة
        </button>
      </div>
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

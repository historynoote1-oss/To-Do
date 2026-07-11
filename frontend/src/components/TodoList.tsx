import { useMemo, useState } from 'react';
import { addItem, toggleItem, deleteItem } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import TodoItemRow from './TodoItem';

const CONFETTI_COLORS = ['#e8a33d', '#f4c878', '#5fd9b4', '#e8615c', '#f3efe7'];

export default function TodoList({ list, onChange, onDeleteList, delay = 0 }: any) {
  const [newItem, setNewItem] = useState('');
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [burstKey, setBurstKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);

  const total = list.items.length;
  const done = list.items.filter((i: any) => i.isDone).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  const isComplete = total > 0 && done === total;

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        tx: `${(Math.random() - 0.5) * 220}px`,
        ty: `${-40 - Math.random() * 90}px`,
        rot: `${Math.random() * 540 - 270}deg`,
        delay: `${Math.random() * 100}ms`,
      })),
    [burstKey]
  );

  async function handleAdd() {
    if (!newItem.trim()) return;
    const content = newItem.trim();
    sounds.addItem();
    setNewItem('');
    try {
      await addItem(list.id, content);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّرت إضافة المهمة');
    }
  }

  function handleDeleteList() {
    sounds.deleteItem();
    onDeleteList(list.id);
  }

  async function handleToggle(item: any) {
    if (item.isDone) sounds.taskUndone();
    else sounds.taskDone();
    const willBeDone = !item.isDone;
    try {
      await toggleItem(item.id, willBeDone);
      if (willBeDone && total > 0) {
        const doneAfter = list.items.filter((i: any) => (i.id === item.id ? true : i.isDone)).length;
        if (doneAfter === total) {
          setConfettiOn(true);
          setBurstKey((k) => k + 1);
          sounds.celebrate();
          window.setTimeout(() => setConfettiOn(false), 900);
        }
      }
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المهمة');
    }
  }

  function handleDeleteItem(item: any) {
    sounds.deleteItem();
    setLeavingIds((prev) => new Set(prev).add(item.id));
    window.setTimeout(async () => {
      try {
        await deleteItem(item.id);
        onChange();
      } catch (err) {
        sounds.error();
        toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة');
      } finally {
        setLeavingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }, 220);
  }

  return (
    <div
      className={`list-card ${isComplete ? 'list-complete' : ''}`}
      style={{ position: 'relative', animationDelay: `${delay}ms` }}
    >
      {confettiOn && (
        <div className="confetti-layer">
          {confettiPieces.map((p) => (
            <span
              key={`${burstKey}-${p.id}`}
              className="confetti-piece"
              style={{
                background: p.color,
                animationDelay: p.delay,
                ['--tx' as any]: p.tx,
                ['--ty' as any]: p.ty,
                ['--rot' as any]: p.rot,
              }}
            />
          ))}
        </div>
      )}

      <div className="list-header">
        <h2>{list.title}</h2>
        <button className="danger small" onClick={handleDeleteList}>
          حذف القائمة
        </button>
      </div>

      {total > 0 && (
        <div className="list-progress-row">
          <div className="list-progress">
            <div className="list-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="list-progress-label">{progress}٪</span>
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

      {total === 0 ? (
        <p className="empty">لسه مفيش مهام هنا</p>
      ) : (
        <ul>
          {list.items.map((item: any, i: number) => (
            <TodoItemRow
              key={item.id}
              item={item}
              delay={i * 40}
              leaving={leavingIds.has(item.id)}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDeleteItem(item)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

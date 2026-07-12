import { useEffect, useRef, useState } from 'react';
import { PriorityBadge } from './Priority';
import { DynamicIcon } from '../lib/icons';

export default function TodoItemRow({
  item,
  onToggle,
  onDelete,
  onPriorityChange,
  onEdit,
  onOpenReminders,
  delay = 0,
  leaving = false,
}: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(item.content);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]);

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.content) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await onEdit(trimmed);
  }

  function cancel() {
    setDraft(item.content);
    setEditing(false);
  }

  return (
    <li
      className={`${item.isDone ? 'done' : ''} ${leaving ? 'leaving' : ''} ${editing ? 'editing' : ''}`}
      style={{ ['--delay' as any]: `${delay}ms` }}
    >
      {editing ? (
        <div className="row-edit-form">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            onBlur={commit}
            autoFocus
          />
        </div>
      ) : (
        <label>
          <span
            className={`checkbox ${item.isDone ? 'checked' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              onToggle();
            }}
          >
            <svg viewBox="0 0 16 16">
              <polyline points="3,9 6.5,12.5 13,4" />
            </svg>
          </span>
          <span onDoubleClick={startEdit}>{item.content}</span>
        </label>
      )}
      {!editing && (
        <div className="row-actions">
          {onPriorityChange && (
            <PriorityBadge value={item.priority || 'NONE'} onChange={onPriorityChange} size="sm" />
          )}
          {item.dueDate && (
            <span className="due-date-chip" title="موعد الاستحقاق">
              <DynamicIcon name="calendar" size={12} /> {new Date(item.dueDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          {onOpenReminders && (
            <button
              className={`icon-btn small reminder-bell ${item._count?.reminders ? 'has-reminders' : ''}`}
              onClick={() => onOpenReminders(item)}
              aria-label="تذكيرات المهمة الفرعية"
              type="button"
              title="التذكيرات"
            >
              <DynamicIcon name="bell" size={13} />
              {item._count?.reminders > 0 && <span className="reminder-count-badge">{item._count.reminders}</span>}
            </button>
          )}
          {onEdit && (
            <button className="icon-btn small row-edit" onClick={startEdit} aria-label="تعديل المهمة الفرعية" type="button">
              <DynamicIcon name="pencil" size={13} />
            </button>
          )}
          <button className="danger small row-delete" onClick={onDelete} aria-label="حذف المهمة الفرعية" type="button">
            <DynamicIcon name="x" size={13} />
          </button>
        </div>
      )}
    </li>
  );
}

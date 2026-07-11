import { PriorityBadge } from './Priority';

export default function TodoItemRow({ item, onToggle, onDelete, onPriorityChange, delay = 0, leaving = false }: any) {
  return (
    <li
      className={`${item.isDone ? 'done' : ''} ${leaving ? 'leaving' : ''}`}
      style={{ ['--delay' as any]: `${delay}ms` }}
    >
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
        <span>{item.content}</span>
      </label>
      <div className="row-actions">
        {onPriorityChange && (
          <PriorityBadge value={item.priority || 'NONE'} onChange={onPriorityChange} size="sm" />
        )}
        <button className="danger small row-delete" onClick={onDelete} aria-label="حذف المهمة الفرعية">
          ✕
        </button>
      </div>
    </li>
  );
}

import { sounds } from '../lib/sounds';

export default function TodoItemRow({ item, onToggle, onDelete }: any) {
  function handleToggle() {
    if (item.isDone) sounds.taskUndone();
    else sounds.taskDone();
    onToggle();
  }

  function handleDelete() {
    sounds.deleteItem();
    onDelete();
  }

  return (
    <li className={item.isDone ? 'done' : ''}>
      <label>
        <span
          className={`checkbox ${item.isDone ? 'checked' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            handleToggle();
          }}
        >
          <svg viewBox="0 0 16 16">
            <polyline points="3,9 6.5,12.5 13,4" />
          </svg>
        </span>
        <span>{item.content}</span>
      </label>
      <button className="danger small" onClick={handleDelete}>
        ✕
      </button>
    </li>
  );
}

export default function TodoItemRow({ item, onToggle, onDelete }: any) {
  return (
    <li className={item.isDone ? 'done' : ''}>
      <label>
        <input type="checkbox" checked={item.isDone} onChange={onToggle} />
        <span>{item.content}</span>
      </label>
      <button className="danger small" onClick={onDelete}>
        ✕
      </button>
    </li>
  );
}

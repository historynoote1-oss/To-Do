import { useMemo, useRef, useState, useEffect } from 'react';
import { addItem, toggleItem, deleteItem, updateItemPriority, updateItemContent, updateList, archiveList } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import TodoItemRow from './TodoItem';
import ConfirmModal from './ConfirmModal';
import RemindersModal from './RemindersModal';
import TaskTimeline from './TaskTimeline';
import { PriorityBadge, PriorityPicker } from './Priority';
import { CategoryBadge } from './Category';
import { LifeAreaBadge } from './LifeArea';
import { PriorityKey, priorityOf } from '../lib/priority';
import { CategoryKey } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';

const CONFETTI_COLORS = ['#1d6f73', '#e8b975', '#2e8b57', '#c1443a', '#6b5fd1'];

export default function TodoList({ list, onChange, onDeleteList, delay = 0, lifeAreas = [], onManageLifeAreas }: any) {
  const [newItem, setNewItem] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<PriorityKey>('NONE');
  const [showItemPriority, setShowItemPriority] = useState(false);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [burstKey, setBurstKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<any>(null);
  const [remindersTarget, setRemindersTarget] = useState<
    { kind: 'list'; id: string; title: string } | { kind: 'item'; id: string; title: string; dueDate: string | null } | null
  >(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) {
      setTitleDraft(list.title);
      requestAnimationFrame(() => titleInputRef.current?.select());
    }
  }, [editingTitle]);

  const total = list.items.length;
  const done = list.items.filter((i: any) => i.isDone).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  const isComplete = total > 0 && done === total;
  const priorityColor = priorityOf(list.priority).color;

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
    const priority = newItemPriority;
    sounds.addItem();
    setNewItem('');
    setNewItemPriority('NONE');
    setShowItemPriority(false);
    try {
      await addItem(list.id, content, priority);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّرت إضافة المهمة الفرعية');
    }
  }

  function handleDeleteList() {
    setConfirmDeleteList(true);
  }

  async function handleArchiveList() {
    sounds.click();
    try {
      await archiveList(list.id);
      toast.success(`"${list.title}" اتنقلت للأرشيف`);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّرت أرشفة المهمة');
    }
  }

  async function confirmDeleteListNow() {
    setConfirmDeleteList(false);
    sounds.deleteItem();
    onDeleteList(list.id);
  }

  async function commitTitle() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === list.title) {
      setTitleDraft(list.title);
      return;
    }
    try {
      await updateList(list.id, { title: trimmed });
      sounds.editItem();
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تعديل اسم المهمة الرئيسية');
      setTitleDraft(list.title);
    }
  }

  function cancelTitleEdit() {
    setTitleDraft(list.title);
    setEditingTitle(false);
  }

  async function handleItemEdit(item: any, content: string) {
    try {
      await updateItemContent(item.id, content);
      sounds.editItem();
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تعديل المهمة الفرعية');
    }
  }

  async function handleListPriorityChange(priority: PriorityKey) {
    try {
      await updateList(list.id, { priority });
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث أولوية المهمة');
    }
  }

  async function handleListCategoryChange(category: CategoryKey | null, targetYear?: number | null) {
    try {
      await updateList(list.id, { category, targetYear: category === 'YEARLY' ? targetYear : null });
      sounds.click();
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث تصنيف المهمة');
    }
  }

  async function handleListLifeAreaChange(lifeAreaId: string | null) {
    try {
      await updateList(list.id, { lifeAreaId });
      sounds.click();
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث مجال الحياة للمهمة');
    }
  }

  async function handleItemPriorityChange(item: any, priority: PriorityKey) {
    try {
      await updateItemPriority(item.id, priority);
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث أولوية المهمة الفرعية');
    }
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
          toast.success(`أحسنت! "${list.title}" اكتملت وانتقلت للأرشيف 🗄️`);
        }
      }
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المهمة');
    }
  }

  function handleDeleteItem(item: any) {
    setConfirmDeleteItem(item);
  }

  function confirmDeleteItemNow() {
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    if (!item) return;
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
      style={{ position: 'relative', animationDelay: `${delay}ms`, ['--card-accent' as any]: isComplete ? 'var(--success)' : priorityColor }}
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
        <div className="list-header-title">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="list-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') cancelTitleEdit();
              }}
              onBlur={commitTitle}
              autoFocus
            />
          ) : (
            <h2 onDoubleClick={() => setEditingTitle(true)}>{list.title}</h2>
          )}
          <PriorityBadge value={list.priority || 'NONE'} onChange={handleListPriorityChange} size="md" />
          <CategoryBadge value={list.category} targetYear={list.targetYear} onChange={handleListCategoryChange} size="md" />
          <LifeAreaBadge
            value={list.lifeArea || null}
            areas={lifeAreas}
            onChange={handleListLifeAreaChange}
            onManage={onManageLifeAreas}
            size="md"
          />
        </div>
        <div className="row-actions">
          {!editingTitle && (
            <button className="icon-btn small" onClick={() => setEditingTitle(true)} aria-label="تعديل المهمة الرئيسية" type="button">
              ✎
            </button>
          )}
          <button
            className={`icon-btn small reminder-bell ${list._count?.reminders ? 'has-reminders' : ''}`}
            onClick={() => setRemindersTarget({ kind: 'list', id: list.id, title: list.title })}
            aria-label="تذكيرات المهمة الرئيسية"
            type="button"
            title="التذكيرات"
          >
            🔔
            {list._count?.reminders > 0 && <span className="reminder-count-badge">{list._count.reminders}</span>}
          </button>
          <button className="icon-btn small" onClick={handleArchiveList} aria-label="أرشفة المهمة الرئيسية" type="button" title="نقل للأرشيف">
            🗄️
          </button>
          <button className="danger small" onClick={handleDeleteList}>
            حذف المهمة الرئيسية
          </button>
        </div>
      </div>

      {total > 0 && (
        <div className="list-progress-row">
          <div className="list-progress">
            <div className="list-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="list-progress-label">
            {done}/{total} · {progress}٪
          </span>
        </div>
      )}

      <TaskTimeline list={list} onChange={onChange} />

      <div className="new-item">
        <div className="new-item-row">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="مهمة فرعية جديدة"
            onFocus={() => setShowItemPriority(true)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button onClick={handleAdd}>+</button>
        </div>
        {showItemPriority && (
          <div className="new-item-priority">
            <PriorityPicker value={newItemPriority} onChange={setNewItemPriority} />
          </div>
        )}
      </div>

      {total === 0 ? (
        <p className="empty">لسه مفيش مهام فرعية هنا</p>
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
              onPriorityChange={(p: PriorityKey) => handleItemPriorityChange(item, p)}
              onEdit={(content: string) => handleItemEdit(item, content)}
              onOpenReminders={(it: any) =>
                setRemindersTarget({ kind: 'item', id: it.id, title: it.content, dueDate: it.dueDate || null })
              }
            />
          ))}
        </ul>
      )}
      {confirmDeleteList && (
        <ConfirmModal
          title="حذف المهمة الرئيسية؟"
          description={
            <>
              هيتم حذف "<strong>{list.title}</strong>" وكل مهامها الفرعية ({total}) نهائيًا. الإجراء ده مينفعش يترجع.
            </>
          }
          confirmLabel="حذف نهائيًا"
          onCancel={() => setConfirmDeleteList(false)}
          onConfirm={confirmDeleteListNow}
        />
      )}

      {confirmDeleteItem && (
        <ConfirmModal
          title="حذف المهمة الفرعية؟"
          description={
            <>
              هيتم حذف "<strong>{confirmDeleteItem.content}</strong>" نهائيًا.
            </>
          }
          confirmLabel="حذف"
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={confirmDeleteItemNow}
        />
      )}

      {remindersTarget && (
        <RemindersModal
          target={remindersTarget}
          onClose={() => {
            setRemindersTarget(null);
            onChange();
          }}
          onDueDateChange={() => onChange()}
        />
      )}
    </div>
  );
}

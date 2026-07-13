import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  addItem,
  toggleItem,
  deleteItem,
  updateItemPriority,
  updateItemContent,
  updateList,
  confirmListDone,
  unconfirmListDone,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import { useUndoRedo } from '../lib/undoRedo';
import TodoItemRow from './TodoItem';
import ConfirmModal from './ConfirmModal';
import RemindersModal from './RemindersModal';
import TaskTimeline from './TaskTimeline';
import TaskEditWizard from './TaskEditWizard';
import { PriorityBadge, PriorityPicker } from './Priority';
import { CategoryBadge } from './Category';
import { LifeAreaBadge } from './LifeArea';
import { PriorityKey, priorityOf } from '../lib/priority';
import { CategoryKey } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';
import { sortItems } from '../lib/organize';

const CONFETTI_COLORS = ['#1d6f73', '#e8b975', '#2e8b57', '#c1443a', '#6b5fd1'];

export default function TodoList({
  list,
  onChange,
  onDeleteList,
  delay = 0,
  lifeAreas = [],
  onManageLifeAreas,
  highlighted = false,
  pendingRestore = false,
  onFinalizeRestore,
}: any) {
  const [newItem, setNewItem] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<PriorityKey>('LOW');
  const [showItemPriority, setShowItemPriority] = useState(false);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [burstKey, setBurstKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<any>(null);
  // بتتحكم في إظهار/إخفاء المهام الفرعية — مقفولة افتراضيًا عشان الكارت
  // يفضل صغير ومضغوط، وبتتفتح لما المستخدم يضغط على اسم المهمة الرئيسية.
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [confirmingDone, setConfirmingDone] = useState(false);
  const [remindersTarget, setRemindersTarget] = useState<
    { kind: 'list'; id: string; title: string } | { kind: 'item'; id: string; title: string; dueDate: string | null } | null
  >(null);
  // معالج التعديل الكامل — بيتفتح بدل التعديل الإنلاين لما المستخدم يضغط قلم
  const [editWizardOpen, setEditWizardOpen] = useState(false);
  const { pushCommand } = useUndoRedo();

  const total = list.items.length;
  const sortedItems = useMemo(() => sortItems(list.items), [list.items]);
  const done = list.items.filter((i: any) => i.isDone).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  // كل المهام الفرعية خلصت — شرط ضروري (بس مش كافي لوحده) عشان مربع
  // التأكيد النهائي يتفعّل. لسه محتاج المستخدم يعلّم عليه بنفسه.
  const allSubtasksDone = total > 0 && done === total;
  // المهمة الرئيسية "خلصت فعلًا" بس لو المستخدم أكّد بنفسه على مربع
  // الإنجاز النهائي — مش مجرد إن كل المهام الفرعية اتعلّمت.
  const isComplete = !!list.confirmedDone && allSubtasksDone;
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

  // حفظ التعديلات من معالج التعديل الكامل (جميع الخطوات دفعة واحدة)
  async function handleEditWizardSave(updates: {
    title: string;
    priority: PriorityKey;
    category: CategoryKey | null;
    targetYear?: number | null;
    lifeAreaId: string | null;
  }) {
    const previousTitle = list.title;
    try {
      await updateList(list.id, {
        title: updates.title,
        priority: updates.priority,
        category: updates.category,
        targetYear: updates.category === 'YEARLY' ? updates.targetYear : null,
        lifeAreaId: updates.lifeAreaId,
      });
      sounds.editItem();
      pushCommand({
        label: `تعديل المهمة "${previousTitle}"`,
        undo: async () => {
          await updateList(list.id, {
            title: previousTitle,
            priority: list.priority,
            category: list.category,
            targetYear: list.targetYear,
            lifeAreaId: list.lifeArea?.id ?? null,
          });
          onChange();
        },
        redo: async () => {
          await updateList(list.id, updates);
          onChange();
        },
      });
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ التعديلات');
      throw err;
    }
  }

  async function handleAdd() {
    if (!newItem.trim()) return;
    const content = newItem.trim();
    const priority = newItemPriority;
    sounds.addItem();
    setNewItem('');
    setNewItemPriority('LOW');
    setShowItemPriority(false);
    setAddOpen(false);
    try {
      const created = await addItem(list.id, content, priority);
      const ref = { id: created.id as string };
      pushCommand({
        label: `إضافة "${content}"`,
        undo: async () => {
          await deleteItem(ref.id);
          onChange();
          toast.info(`تم التراجع عن إضافة "${content}"`);
        },
        redo: async () => {
          const recreated = await addItem(list.id, content, priority);
          ref.id = recreated.id;
          onChange();
        },
      });
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّرت إضافة المهمة الفرعية');
    }
  }

  function handleDeleteList() {
    setConfirmDeleteList(true);
  }

  // مربع الـ Check بتاع المهمة الرئيسية بقى "تأكيد إنجاز نهائي" مستقل تمامًا
  // عن تعليم المهام الفرعية. ممنوع يتفعّل (يبقى أخضر) إلا لو كل المهام
  // الفرعية اتعلّمت خلاص. تعليمها كلها لوحده مش بيأرشف المهمة — الأرشفة
  // بتحصل بس لما المستخدم يعلّم هنا بنفسه.
  async function handleToggleWholeList() {
    if (total === 0 || confirmingDone) return;

    if (!list.confirmedDone && !allSubtasksDone) {
      sounds.error();
      toast.error('لازم تخلّص كل المهام الفرعية الأول قبل ما تأكّد إنهاء المهمة الرئيسية');
      return;
    }

    sounds.click();
    setConfirmingDone(true);
    try {
      if (list.confirmedDone) {
        await unconfirmListDone(list.id);
        onChange();
      } else {
        await confirmListDone(list.id);
        setConfettiOn(true);
        setBurstKey((k) => k + 1);
        sounds.celebrate();
        window.setTimeout(() => setConfettiOn(false), 900);
        toast.success(`أحسنت! "${list.title}" اكتملت وانتقلت للأرشيف`);
        onChange();
      }
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث المهمة');
    } finally {
      setConfirmingDone(false);
    }
  }

  async function confirmDeleteListNow() {
    setConfirmDeleteList(false);
    sounds.deleteItem();
    onDeleteList(list.id);
  }

  function startTitleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    // بنفتح معالج التعديل الكامل بدل التعديل الإنلاين
    setEditWizardOpen(true);
  }

  async function handleItemEdit(item: any, content: string) {
    const previousContent = item.content;
    if (content === previousContent) return;
    try {
      await updateItemContent(item.id, content);
      sounds.editItem();
      pushCommand({
        label: `تعديل "${previousContent}"`,
        undo: async () => {
          await updateItemContent(item.id, previousContent);
          onChange();
        },
        redo: async () => {
          await updateItemContent(item.id, content);
          onChange();
        },
      });
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
      pushCommand({
        label: willBeDone ? `إنجاز "${item.content}"` : `إلغاء إنجاز "${item.content}"`,
        undo: async () => {
          await toggleItem(item.id, !willBeDone);
          onChange();
        },
        redo: async () => {
          await toggleItem(item.id, willBeDone);
          onChange();
        },
      });
      // خلاص كل المهام الفرعية معلّمة — ده لسه مش كافي لإنهاء المهمة
      // الرئيسية، فقط بيفعّل مربع التأكيد النهائي. مفيش أرشفة تلقائية هنا.
      if (willBeDone && total > 0) {
        const doneAfter = list.items.filter((i: any) => (i.id === item.id ? true : i.isDone)).length;
        if (doneAfter === total) {
          sounds.click();
          toast.info(`كل المهام الفرعية خلصت في "${list.title}" — علّم على المهمة الرئيسية عشان تأكّد الإنهاء`);
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
        // ref.id بيتبع آخر id حقيقي للمهمة الفرعية دي — بيتغيّر بعد كل
        // استرجاع (Undo) لأنها بتاخد id جديد من السيرفر كل مرة تتعمل فيها.
        const ref = { id: item.id as string };
        pushCommand({
          label: `حذف "${item.content}"`,
          undo: async () => {
            const recreated = await addItem(list.id, item.content, item.priority);
            if (item.isDone) {
              await toggleItem(recreated.id, true);
            }
            ref.id = recreated.id;
            onChange();
            sounds.success();
            toast.success(`تم استرجاع "${item.content}"`);
          },
          redo: async () => {
            await deleteItem(ref.id);
            onChange();
            toast.info(`تم حذف "${item.content}" مرة أخرى`);
          },
        });
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

  const checkboxTitle =
    total === 0
      ? 'أضف مهمة فرعية الأول'
      : list.confirmedDone
      ? 'إلغاء تأكيد إنهاء المهمة'
      : allSubtasksDone
      ? 'تأكيد إنهاء المهمة'
      : 'لازم تخلّص كل المهام الفرعية الأول';

  return (
    <div
      className={`list-card list-card-compact ${isComplete ? 'list-complete' : ''} ${highlighted ? 'list-card-jump-highlight' : ''} ${pendingRestore ? 'list-card-pending-restore' : ''}`}
      style={{
        position: 'relative',
        animationDelay: `${delay}ms`,
        ['--card-accent' as any]: pendingRestore ? 'var(--pending-restore)' : isComplete ? 'var(--success)' : priorityColor,
      }}
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

      {/* السطر الأول: مربع التأكيد + اسم المهمة + أزرار التحكم
          padding-top مساوي للـ padding-bottom عشان الكارت يبدو متوازن */}
      <div className="list-header" style={{ paddingTop: 'var(--card-pad, 14px)' }}>
        <span
          className={`checkbox list-checkbox ${isComplete ? 'checked' : ''} ${total === 0 || (!allSubtasksDone && !list.confirmedDone) ? 'disabled' : ''}`}
          onClick={handleToggleWholeList}
          role="checkbox"
          aria-checked={isComplete}
          aria-label="تأكيد إنجاز المهمة الرئيسية"
          title={checkboxTitle}
        >
          <svg viewBox="0 0 16 16">
            <polyline points="3,9 6.5,12.5 13,4" />
          </svg>
        </span>

        <div className="list-header-title">
          {/* اسم المهمة — نقرة واحدة تفتح المهام الفرعية (كـ overlay كامل)
              التعديل الإنلاين أُلغي — المعالج الكامل بيتفتح من زرار القلم */}
          <button
            type="button"
            className="list-title-toggle"
            onClick={() => setSubtasksOpen(true)}
            title="عرض المهام الفرعية"
          >
            <h2>{list.title}</h2>
            {total > 0 && (
              <span className="list-title-subcount">
                {done}/{total}
              </span>
            )}
          </button>
          {list.recurringTaskId && (
            <span className="recurring-origin-badge" title="اتولّدت تلقائيًا من مهمة متكررة">
              <DynamicIcon name="repeat" size={12} />
            </span>
          )}
          {pendingRestore && (
            <span className="pending-restore-ribbon" title="مسترجعة من الأرشيف — بانتظار مراجعتك">
              <DynamicIcon name="undo" size={12} /> بانتظار المراجعة
            </span>
          )}
        </div>

        {/* الأيقونات دايمًا ظاهرة — opacity:1 و visibility:visible صريحة
            عشان نضمن إنها مش بتتخفى بأي CSS hover-only */}
        <div className="row-actions" style={{ opacity: 1, visibility: 'visible', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="icon-btn small"
            onClick={startTitleEdit}
            aria-label="تعديل المهمة الرئيسية"
            type="button"
            title="تعديل"
            style={{ opacity: 1, visibility: 'visible' }}
          >
            <DynamicIcon name="pencil" size={14} />
          </button>
          <button
            className="icon-btn small danger"
            onClick={handleDeleteList}
            aria-label="حذف المهمة الرئيسية"
            type="button"
            title="حذف"
            style={{ opacity: 1, visibility: 'visible' }}
          >
            <DynamicIcon name="trash-2" size={14} />
          </button>
        </div>
      </div>

      {/* السطر الثاني: الأولوية + التصنيف + مجال الحياة (صغيرة ومضغوطة على اليمين)
          والمساحة الباقية للعدادين (التذكير + الـ deadline) على اليسار
          كل حاجة هنا display-only لا تقبل تعديل */}
      <div className="list-meta-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
        {/* الشارات — مضغوطة على جانب واحد */}
        <div className="list-meta-badges" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <PriorityBadge value={list.priority || 'NONE'} onChange={handleListPriorityChange} size="sm" disabled />
          <CategoryBadge value={list.category} targetYear={list.targetYear} onChange={handleListCategoryChange} size="sm" disabled />
          <LifeAreaBadge
            value={list.lifeArea || null}
            areas={lifeAreas}
            onChange={handleListLifeAreaChange}
            onManage={onManageLifeAreas}
            size="sm"
            disabled
          />
        </div>
        {/* العدادات — تأخذ المساحة الباقية */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <TaskTimeline list={list} onChange={onChange} />
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

      {/* مودال المهام الفرعية — يتعرض عبر portal مباشرة على document.body
          عشان يكون فوق الصفحة كلها ومش محصور جوه الكارت */}
      {subtasksOpen && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setSubtasksOpen(false)}>
          <div className="modal-box subtasks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="subtasks-modal-header">
              <h2>{list.title}</h2>
              {total > 0 && <span className="list-title-subcount">{done}/{total}</span>}
            </div>

            {addOpen ? (
              <div className="new-item">
                <div className="new-item-row">
                  <input
                    autoFocus
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="مهمة فرعية جديدة"
                    onFocus={() => setShowItemPriority(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd();
                      if (e.key === 'Escape') setAddOpen(false);
                    }}
                  />
                  <button onClick={handleAdd}>+</button>
                </div>
                {showItemPriority && (
                  <div className="new-item-priority">
                    <PriorityPicker value={newItemPriority} onChange={setNewItemPriority} />
                  </div>
                )}
              </div>
            ) : (
              <button className="add-subtask-trigger" onClick={() => setAddOpen(true)} type="button">
                <DynamicIcon name="plus" size={13} /> مهمة فرعية جديدة
              </button>
            )}

            {total === 0 ? (
              <p className="empty small">لسه مفيش مهام فرعية هنا</p>
            ) : (
              <ul className="subtask-tree subtasks-modal-list">
                {sortedItems.map((item: any, i: number) => (
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

            <div className="modal-actions">
              <button className="small" onClick={() => setSubtasksOpen(false)} type="button">
                إغلاق
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pendingRestore && (
        <div className="pending-restore-footer">
          <p className="pending-restore-footer-hint">
            <DynamicIcon name="sparkles" size={13} /> راجع المهمة وعدّلها لو محتاجة، وبعدين أكّد رجوعها لقائمتك النشطة
          </p>
          <button type="button" className="pending-restore-confirm" onClick={onFinalizeRestore}>
            <DynamicIcon name="check" size={15} /> إضافة المهمة
          </button>
        </div>
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

      {/* معالج التعديل الكامل — portal فوق الصفحة كلها بنفس مراحل الإنشاء */}
      {editWizardOpen && (
        <TaskEditWizard
          list={list}
          lifeAreas={lifeAreas}
          onManageLifeAreas={onManageLifeAreas}
          onSave={handleEditWizardSave}
          onClose={() => setEditWizardOpen(false)}
        />
      )}
    </div>
  );
}

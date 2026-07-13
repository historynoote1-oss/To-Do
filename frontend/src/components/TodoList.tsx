import { useMemo, useRef, useState, useEffect } from 'react';
import {
  addItem,
  toggleItem,
  deleteItem,
  updateItemPriority,
  updateItemContent,
  updateList,
  confirmListDone,
  unconfirmListDone,
  createReminder,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import { useUndoRedo } from '../lib/undoRedo';
import TodoItemRow from './TodoItem';
import ConfirmModal from './ConfirmModal';
import RemindersModal from './RemindersModal';
import TaskTimeline from './TaskTimeline';
import AddTaskModal, { NewTaskPayload } from './AddTaskModal';
import Portal from './Portal';
import { PriorityBadge } from './Priority';
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
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [burstKey, setBurstKey] = useState(0);
  const [confettiOn, setConfettiOn] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  // بتفتح نافذة تعديل المهمة (نفس مراحل الإنشاء بالظبط بس في وضع تعديل) —
  // بتتفتح لما يدوس المستخدم على أيقونة القلم في رأس الكارت.
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<any>(null);
  // بتتحكم في إظهار/إخفاء المهام الفرعية — مقفولة افتراضيًا عشان الكارت
  // يفضل صغير ومضغوط، وبتتفتح لما المستخدم يضغط على أيقونة المهام الفرعية
  // في رأس الكارت. النافذة دي للعرض والتأشير بس — إضافة مهام فرعية جديدة
  // بقت بس من خطوة "المهام الفرعية" في نافذة التعديل (أيقونة القلم).
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [confirmingDone, setConfirmingDone] = useState(false);
  const [remindersTarget, setRemindersTarget] = useState<
    { kind: 'list'; id: string; title: string } | { kind: 'item'; id: string; title: string; dueDate: string | null } | null
  >(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { pushCommand } = useUndoRedo();

  useEffect(() => {
    if (editingTitle) {
      setTitleDraft(list.title);
      requestAnimationFrame(() => titleInputRef.current?.select());
    }
  }, [editingTitle]);

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

  async function handleEditSaveNewSubtasks(newSubtasks: string[]) {
    for (const content of newSubtasks) {
      await addItem(list.id, content);
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

  async function commitTitle() {
    const trimmed = titleDraft.trim();
    const previousTitle = list.title;
    setEditingTitle(false);
    if (!trimmed || trimmed === previousTitle) {
      setTitleDraft(previousTitle);
      return;
    }
    try {
      await updateList(list.id, { title: trimmed });
      sounds.editItem();
      pushCommand({
        label: `تعديل اسم "${previousTitle}"`,
        undo: async () => {
          await updateList(list.id, { title: previousTitle });
          onChange();
        },
        redo: async () => {
          await updateList(list.id, { title: trimmed });
          onChange();
        },
      });
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تعديل اسم المهمة الرئيسية');
      setTitleDraft(previousTitle);
    }
  }

  function cancelTitleEdit() {
    setTitleDraft(list.title);
    setEditingTitle(false);
  }

  function startTitleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingTitle(true);
  }

  // بيتنادى من نافذة تعديل المهمة (نفس ويزارد الإنشاء، بس في وضع تعديل).
  // بيحدّث بيانات المهمة الرئيسية، وبعدين لو المستخدم ضاف تذكيرات جديدة
  // من خطوة "التذكير" بيتم إنشاؤها فعليًا (التذكيرات القديمة متتلمسش).
  async function handleEditSave(id: string, data: NewTaskPayload) {
    try {
      await updateList(id, {
        title: data.title,
        priority: data.priority,
        category: data.category,
        targetYear: data.targetYear,
        lifeAreaId: data.lifeAreaId,
        startTime: data.startTime,
        endTime: data.endTime,
      });
      if (data.subtasks.length > 0) {
        await handleEditSaveNewSubtasks(data.subtasks);
      }
      for (const r of data.reminders) {
        await createReminder({
          listId: id,
          mode: 'BEFORE_DUE',
          offsetMinutes: r.offsetMinutes,
          message: r.message || undefined,
        });
      }
      sounds.click();
      toast.success('اتحدّثت المهمة');
      onChange();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ التعديلات');
      throw err;
    }
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

      <div className="list-header">
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
            <div className="list-title-plain" onDoubleClick={startTitleEdit} title="دبل كليك للتعديل السريع للاسم">
              <h2>{list.title}</h2>
              {total > 0 && (
                <span className="list-title-subcount">
                  {done}/{total}
                </span>
              )}
            </div>
          )}
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

        <div className="row-actions card-actions">
          {!editingTitle && (
            <button className="card-icon-action" onClick={() => setEditModalOpen(true)} aria-label="تعديل المهمة الرئيسية" type="button" title="تعديل">
              <DynamicIcon name="pencil" size={17} />
            </button>
          )}
          {!editingTitle && (
            <button className="card-icon-action" onClick={() => setSubtasksOpen(true)} aria-label="عرض المهام الفرعية" type="button" title="المهام الفرعية">
              <DynamicIcon name="list-checks" size={17} />
              {total > 0 && <span className="subtask-count-badge">{total}</span>}
            </button>
          )}
          <button className="card-icon-action danger" onClick={handleDeleteList} aria-label="حذف المهمة الرئيسية" type="button" title="حذف">
            <DynamicIcon name="trash" size={17} />
          </button>
        </div>
      </div>

      {/* شريط بيانات معروضة فقط — أولوية / تصنيف / مجال حياة (يمين السطر)،
          وباقي السطر كله لعدّاد التذكير وعدّاد الجدول الزمني للمهمة. مفيش
          أي حاجة هنا قابلة للنقر للتعديل المباشر — التعديل بقى عن طريق
          أيقونة القلم فوق. */}
      <div className="list-meta-row">
        <div className="list-meta-badges">
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
        <div className="list-meta-timers">
          <button
            className={`icon-btn small reminder-bell ${list._count?.reminders ? 'has-reminders' : ''}`}
            onClick={() => setRemindersTarget({ kind: 'list', id: list.id, title: list.title })}
            aria-label="تذكيرات المهمة"
            type="button"
            title="التذكيرات"
          >
            <DynamicIcon name="bell" size={13} />
            {list._count?.reminders > 0 && <span className="reminder-count-badge">{list._count.reminders}</span>}
          </button>
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

      {subtasksOpen && (
        <Portal>
        <div className="modal-overlay" onClick={() => setSubtasksOpen(false)}>
          <div className="modal-box subtasks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="subtasks-modal-header">
              <h2>{list.title}</h2>
              {total > 0 && <span className="list-title-subcount">{done}/{total}</span>}
            </div>

            {total === 0 ? (
              <p className="empty small">لسه مفيش مهام فرعية هنا — تقدر تضيف من أيقونة القلم فوق</p>
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
        </div>
        </Portal>
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

      {editModalOpen && (
        <AddTaskModal
          open={editModalOpen}
          lifeAreas={lifeAreas}
          onClose={() => setEditModalOpen(false)}
          onManageLifeAreas={() => {
            setEditModalOpen(false);
            onManageLifeAreas?.();
          }}
          editTarget={{
            id: list.id,
            title: list.title,
            priority: list.priority || 'MEDIUM',
            category: list.category ?? null,
            targetYear: list.targetYear ?? null,
            lifeAreaId: list.lifeArea?.id ?? list.lifeAreaId ?? null,
            startTime: list.startTime ?? null,
            endTime: list.endTime ?? null,
          }}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}

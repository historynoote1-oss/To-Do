import { useEffect, useState } from 'react';
import {
  getRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  pauseRecurringTask,
  resumeRecurringTask,
  generateRecurringTaskNow,
  deleteRecurringTask,
  RecurringTaskData,
} from '@/lib/api/api';
import { PriorityPicker } from '@/components/life-areas/Priority';
import { LifeAreaPicker } from '@/components/life-areas/LifeArea';
import { PriorityKey } from '@/lib/core/priority';
import { LifeAreaData } from '@/lib/core/lifeArea';
import { FREQUENCY_OPTIONS, RecurrenceFrequency, intervalDescription, formatDateShort } from '@/lib/core/recurrence';
import { DynamicIcon } from '@/lib/core/icons';
import { toast } from '@/lib/core/toast';
import { sounds } from '@/lib/audio/sounds';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';
import AddRecurringTaskModal, { NewRecurringTaskPayload } from '@/components/tasks/AddRecurringTaskModal';

interface SubtaskDraft {
  key: string;
  content: string;
  priority: PriorityKey;
}

interface FormState {
  title: string;
  priority: PriorityKey;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string; // yyyy-mm-dd
  lifeAreaId: string | null;
  items: SubtaskDraft[];
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm(): FormState {
  return { title: '', priority: 'MEDIUM', frequency: 'DAILY', interval: 1, startDate: todayIso(), lifeAreaId: null, items: [] };
}

let subtaskKeySeq = 0;
function newSubtaskKey() {
  subtaskKeySeq += 1;
  return `draft-${subtaskKeySeq}`;
}

// ===== محرر المهام الفرعية (Subtask Templates Editor) =====
// بيُستخدم في نموذج التعديل هنا (نموذج الإنشاء بقى نافذة منفصلة
// AddRecurringTaskModal بخطوة مستقلة لنفس الفكرة) — كل مهمة فرعية هنا
// بتتنسخ تلقائيًا لكل نسخة جديدة تتولّد من القالب (شوف backend/lib/recurringTaskScheduler.ts).
function SubtaskEditor({ items, onChange }: { items: SubtaskDraft[]; onChange: (items: SubtaskDraft[]) => void }) {
  const [draft, setDraft] = useState('');

  function add() {
    const content = draft.trim();
    if (!content) return;
    onChange([...items, { key: newSubtaskKey(), content, priority: 'NONE' }]);
    setDraft('');
  }

  return (
    <div className="recurring-subtask-editor">
      {items.length > 0 && (
        <ul className="recurring-subtask-list">
          {items.map((it) => (
            <li key={it.key} className="recurring-subtask-row">
              <span className="recurring-subtask-content">{it.content}</span>
              <button
                type="button"
                className="icon-btn small"
                onClick={() => onChange(items.filter((x) => x.key !== it.key))}
                aria-label="حذف المهمة الفرعية"
                title="حذف"
              >
                <DynamicIcon name="x" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="recurring-subtask-add-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="مهمة فرعية هتتكرر مع كل نسخة (اختياري)"
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="small" onClick={add} disabled={!draft.trim()}>
          <DynamicIcon name="plus" size={14} /> إضافة
        </button>
      </div>
    </div>
  );
}

function FrequencyPicker({
  frequency,
  interval,
  onChange,
}: {
  frequency: RecurrenceFrequency;
  interval: number;
  onChange: (frequency: RecurrenceFrequency, interval: number) => void;
}) {
  return (
    <div className="recurring-frequency-row">
      <div className="priority-picker recurring-frequency-picker" role="radiogroup" aria-label="اختيار نمط التكرار">
        {FREQUENCY_OPTIONS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`priority-picker-item ${f.key === frequency ? 'selected' : ''}`}
            onClick={() => onChange(f.key, interval)}
            role="radio"
            aria-checked={f.key === frequency}
          >
            <DynamicIcon name="repeat" size={13} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <div className="recurring-interval-field">
        <span>كل</span>
        <input
          type="number"
          min={1}
          max={365}
          value={interval}
          onChange={(e) => onChange(frequency, Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
        />
        <span>{FREQUENCY_OPTIONS.find((f) => f.key === frequency)?.unit}</span>
      </div>
    </div>
  );
}

export default function RecurringTasksManager({
  lifeAreas,
  onBack,
  onChange,
  onManageLifeAreas,
  onOpenMenu,
  menuOpen,
  onLifeAreaCreated,
}: {
  lifeAreas: LifeAreaData[];
  onBack: () => void;
  onChange?: () => void;
  onManageLifeAreas: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onLifeAreaCreated?: (area: LifeAreaData) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<RecurringTaskData[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecurringTaskData | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getRecurringTasks();
      setTasks(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل المهام المتكررة');
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    onChange?.();
  }

  async function handleCreate(data: NewRecurringTaskPayload) {
    try {
      const task = await createRecurringTask({
        title: data.title,
        priority: data.priority,
        frequency: data.frequency,
        interval: data.interval,
        startDate: data.startDate,
        lifeAreaId: data.lifeAreaId,
        items: data.items.map((it) => ({ content: it.content, priority: it.priority })),
      });
      setTasks((prev) => [...prev, task]);
      sounds.addItem();
      toast.success(`اتضافت المهمة المتكررة "${data.title}" — أول نسخة هتتولّد تلقائيًا في موعدها`);
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء المهمة المتكررة');
      throw err;
    }
  }

  function startEdit(task: RecurringTaskData) {
    setEditingId(task.id);
    setEditForm({
      title: task.title,
      priority: task.priority as PriorityKey,
      frequency: task.frequency,
      interval: task.interval,
      startDate: task.startDate.slice(0, 10),
      lifeAreaId: task.lifeAreaId,
      items: task.items.map((it) => ({ key: it.id, content: it.content, priority: it.priority as PriorityKey })),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
  }

  async function handleSaveEdit(id: string) {
    const title = editForm.title.trim();
    if (!title) {
      toast.error('اسم المهمة مينفعش يبقى فاضي');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateRecurringTask(id, {
        title,
        priority: editForm.priority,
        frequency: editForm.frequency,
        interval: editForm.interval,
        startDate: editForm.startDate,
        lifeAreaId: editForm.lifeAreaId,
        items: editForm.items.map((it) => ({ content: it.content, priority: it.priority })),
      });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
      sounds.click();
      toast.success('اتحدّثت المهمة المتكررة');
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تعديل المهمة المتكررة');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(task: RecurringTaskData) {
    setBusyId(task.id);
    try {
      const updated = task.isActive ? await pauseRecurringTask(task.id) : await resumeRecurringTask(task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      sounds.click();
      toast.info(updated.isActive ? `"${task.title}" هتكمل تتولّد تلقائيًا تاني` : `تم إيقاف "${task.title}" مؤقتًا`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تغيير حالة المهمة');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateNow(task: RecurringTaskData) {
    setBusyId(task.id);
    try {
      await generateRecurringTaskNow(task.id);
      sounds.addItem();
      toast.success(`اتولّدت نسخة جديدة من "${task.title}" دلوقتي`);
      notifyChanged();
      load();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر توليد نسخة جديدة');
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(task: RecurringTaskData) {
    setConfirmDelete(task);
  }

  async function confirmDeleteNow() {
    const task = confirmDelete;
    setConfirmDelete(null);
    if (!task) return;
    const snapshot = tasks;
    sounds.deleteItem();
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await deleteRecurringTask(task.id);
      toast.info(`اتحذفت المهمة المتكررة "${task.title}" — النسخ اللي اتولّدت قبل كده هتفضل زي ما هي`);
      notifyChanged();
    } catch (err) {
      setTasks(snapshot);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة المتكررة');
    }
  }

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>المهام المتكررة</strong>
          <button
            className="icon-btn hamburger-btn"
            onClick={onOpenMenu}
            type="button"
            title="القائمة"
            aria-label="فتح القائمة"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className="life-area-intro">
        <DynamicIcon name="repeat" size={28} className="life-area-intro-icon" />
        <div>
          <h1>المهام المتكررة</h1>
          <p>
            أنشئ مهمة مرة واحدة وخليها تتكرر لوحدها — يوميًا، أسبوعيًا، شهريًا، أو سنويًا، بأي دورة تناسبك (كل يومين،
            كل 3 أسابيع...). كل قوالبك محفوظة هنا في مكانها عشان ترجعلها تعدّل عليها في أي وقت.
          </p>
        </div>
      </div>

      {/* ===== إنشاء مهمة متكررة جديدة — نفس نظام إنشاء المهمة العادية ===== */}
      <div className="quick-add-row">
        <button className="quick-add-card quick-add-card-recurring" onClick={() => setAddOpen(true)} type="button">
          <span className="quick-add-icon-wrap quick-add-icon-wrap-recurring">
            <DynamicIcon name="repeat" size={22} />
            <span className="quick-add-badge">
              <DynamicIcon name="plus" size={10} />
            </span>
          </span>
          <span className="quick-add-label">مهمة متكررة جديدة</span>
          <span className="quick-add-hint">اسم، مهام فرعية، أولوية، دورة تكرار، ومجال حياة</span>
        </button>
      </div>

      <AddRecurringTaskModal
        open={addOpen}
        lifeAreas={lifeAreas}
        onClose={() => setAddOpen(false)}
        onManageLifeAreas={onManageLifeAreas}
        onCreate={handleCreate}
        onLifeAreaCreated={onLifeAreaCreated}
      />

      {/* ===== قائمة المهام المتكررة الحالية ===== */}
      {loading && (
        <div className="lists-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <p className="empty">
          <DynamicIcon name="repeat" size={32} className="empty-icon" />
          لسه مفيش مهام متكررة، ابدأ بإنشاء أول واحدة فوق
        </p>
      )}

      {!loading && tasks.length > 0 && (
        <div className="life-area-list">
          {tasks.map((task) => {
            const isEditing = editingId === task.id;
            const isBusy = busyId === task.id;
            return (
              <div key={task.id} className={`life-area-card recurring-task-card ${!task.isActive ? 'recurring-paused' : ''}`}>
                <div className="recurring-task-icon-wrap">
                  <span className="recurring-task-icon">
                    <DynamicIcon name="repeat" size={22} />
                  </span>
                </div>

                <div className="life-area-card-body">
                  {isEditing ? (
                    <div className="life-area-edit-form">
                      <input
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        maxLength={80}
                        autoFocus
                      />
                      <label className="life-area-edit-subtitle">الأولوية</label>
                      <PriorityPicker value={editForm.priority} onChange={(priority) => setEditForm((f) => ({ ...f, priority }))} />
                      <label className="life-area-edit-subtitle">دورة التكرار</label>
                      <FrequencyPicker
                        frequency={editForm.frequency}
                        interval={editForm.interval}
                        onChange={(frequency, interval) => setEditForm((f) => ({ ...f, frequency, interval }))}
                      />
                      <label className="life-area-edit-subtitle">تاريخ أول تكرار</label>
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                      />
                      <label className="life-area-edit-subtitle">مجال الحياة</label>
                      <LifeAreaPicker
                        value={editForm.lifeAreaId}
                        areas={lifeAreas}
                        onChange={(lifeAreaId) => setEditForm((f) => ({ ...f, lifeAreaId }))}
                        onManage={onManageLifeAreas}
                      />
                      <label className="life-area-edit-subtitle">المهام الفرعية الثابتة</label>
                      <SubtaskEditor items={editForm.items} onChange={(items) => setEditForm((f) => ({ ...f, items }))} />
                      <div className="modal-actions">
                        <button className="small" onClick={cancelEdit} type="button">
                          إلغاء
                        </button>
                        <button className="small" onClick={() => handleSaveEdit(task.id)} disabled={savingEdit} type="button">
                          {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="life-area-card-header">
                        <h3>{task.title}</h3>
                        <div className="row-actions">
                          <button
                            className="icon-btn small"
                            onClick={() => startEdit(task)}
                            aria-label="تعديل المهمة المتكررة"
                            type="button"
                            title="تعديل"
                          >
                            <DynamicIcon name="pencil" size={14} />
                          </button>
                          <button className="danger small" onClick={() => handleDelete(task)} type="button">
                            حذف
                          </button>
                        </div>
                      </div>

                      <div className="life-area-stats-row">
                        <span className="life-area-stat recurring-frequency-badge">
                          <DynamicIcon name="repeat" size={12} /> {intervalDescription(task.frequency, task.interval)}
                        </span>
                        {task.lifeArea && <span className="life-area-stat">{task.lifeArea.name}</span>}
                        <span className="life-area-stat">{task._count.generatedLists} نسخة اتولّدت</span>
                      </div>

                      <div className="recurring-task-meta">
                        {task.isActive ? (
                          <span>
                            <DynamicIcon name="calendar" size={13} /> النسخة الجاية: {formatDateShort(task.nextRunAt)}
                          </span>
                        ) : (
                          <span className="recurring-paused-label">
                            <DynamicIcon name="pause" size={13} /> متوقفة مؤقتًا
                          </span>
                        )}
                        {task.items.length > 0 && <span>{task.items.length} مهمة فرعية ثابتة</span>}
                      </div>

                      <div className="modal-actions recurring-task-actions">
                        <button
                          type="button"
                          className="small"
                          onClick={() => handleGenerateNow(task)}
                          disabled={isBusy}
                          title="ولّد نسخة الآن من غير ما تستنى الموعد"
                        >
                          <DynamicIcon name="sparkles" size={14} /> توليد نسخة الآن
                        </button>
                        <button type="button" className="small" onClick={() => handleToggleActive(task)} disabled={isBusy}>
                          {task.isActive ? (
                            <>
                              <DynamicIcon name="pause" size={14} /> إيقاف مؤقت
                            </>
                          ) : (
                            <>
                              <DynamicIcon name="play" size={14} /> استئناف
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="حذف المهمة المتكررة؟"
          description={
            <>
              هيتم حذف قالب "<strong>{confirmDelete.title}</strong>" نهائيًا ومش هيتولّد منه نسخ جديدة. النسخ
              اللي اتولّدت قبل كده ({confirmDelete._count.generatedLists}) مش هتتحذف، هتفضل زي ما هي.
            </>
          }
          confirmLabel="حذف المهمة المتكررة"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteNow}
        />
      )}
    </div>
  );
}

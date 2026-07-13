import { useState } from 'react';
import ReactDOM from 'react-dom';
import { PriorityKey } from '../lib/priority';
import { CategoryKey } from '../lib/category';
import { PriorityPicker } from './Priority';
import { CategoryPicker } from './Category';
import { LifeAreaPicker } from './LifeArea';
import { DynamicIcon } from '../lib/icons';

// ═══════════════════════════════════════════════════════════════════
// معالج تعديل المهمة — نفس خطوات إنشاء مهمة جديدة بالظبط
// بيتعرض كـ overlay فوق الصفحة كلها (عبر portal في document.body)
// الخطوات:
//   1. اسم المهمة الرئيسية
//   2. الأولوية
//   3. التصنيف ومجال الحياة
// ═══════════════════════════════════════════════════════════════════

interface TaskEditWizardProps {
  list: {
    id: string;
    title: string;
    priority?: string | null;
    category?: string | null;
    targetYear?: number | null;
    lifeArea?: { id: string } | null;
  };
  lifeAreas: any[];
  onManageLifeAreas?: () => void;
  onSave: (updates: {
    title: string;
    priority: PriorityKey;
    category: CategoryKey | null;
    targetYear?: number | null;
    lifeAreaId: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

const STEPS = ['اسم المهمة', 'الأولوية', 'التصنيف ومجال الحياة'];
const TOTAL_STEPS = STEPS.length;

export default function TaskEditWizard({
  list,
  lifeAreas,
  onManageLifeAreas,
  onSave,
  onClose,
}: TaskEditWizardProps) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(list.title || '');
  const [priority, setPriority] = useState<PriorityKey>((list.priority as PriorityKey) || 'LOW');
  const [category, setCategory] = useState<CategoryKey | null>((list.category as CategoryKey) || null);
  const [targetYear, setTargetYear] = useState<number | null>(list.targetYear || null);
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(list.lifeArea?.id || null);
  const [saving, setSaving] = useState(false);

  function handleCategoryChange(key: CategoryKey | null, year?: number | null) {
    setCategory(key);
    if (key === 'YEARLY' && year) setTargetYear(year);
    else if (key !== 'YEARLY') setTargetYear(null);
  }

  function canNext(): boolean {
    if (step === 0) return title.trim().length > 0;
    return true;
  }

  function goNext() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        priority,
        category,
        targetYear,
        lifeAreaId,
      });
      onClose();
    } catch {
      setSaving(false);
    }
  }

  const modal = (
    <div
      className="modal-overlay task-edit-wizard-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box task-edit-wizard" role="dialog" aria-modal="true" aria-label="تعديل المهمة">
        {/* رأس المعالج */}
        <div className="task-edit-wizard-header">
          <button
            type="button"
            className="icon-btn small"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <DynamicIcon name="x" size={16} />
          </button>
          <span className="task-edit-wizard-title">
            <DynamicIcon name="pencil" size={15} />
            تعديل المهمة
          </span>
          <span className="task-edit-wizard-step-counter">
            {step + 1}/{TOTAL_STEPS}
          </span>
        </div>

        {/* شريط التقدّم */}
        <div className="task-edit-wizard-progress">
          {STEPS.map((label, i) => (
            <div
              key={i}
              className={`task-edit-wizard-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
              title={label}
            />
          ))}
        </div>

        {/* عنوان الخطوة */}
        <h3 className="task-edit-wizard-step-title">{STEPS[step]}</h3>

        {/* محتوى الخطوة */}
        <div className="task-edit-wizard-body">
          {step === 0 && (
            <div className="task-edit-wizard-field">
              <input
                autoFocus
                className="task-edit-wizard-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="اسم المهمة الرئيسية"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canNext()) goNext();
                  if (e.key === 'Escape') onClose();
                }}
              />
              <span className="task-edit-wizard-char-count">{title.length}/200</span>
            </div>
          )}

          {step === 1 && (
            <div className="task-edit-wizard-field">
              <PriorityPicker value={priority} onChange={setPriority} />
            </div>
          )}

          {step === 2 && (
            <div className="task-edit-wizard-field task-edit-wizard-combined">
              <div className="task-edit-wizard-section-label">
                <DynamicIcon name="tag" size={13} /> التصنيف
              </div>
              <CategoryPicker value={category} targetYear={targetYear} onChange={handleCategoryChange} />

              <div className="task-edit-wizard-section-label" style={{ marginTop: 20 }}>
                <DynamicIcon name="layers" size={13} /> مجال الحياة
              </div>
              <LifeAreaPicker
                value={lifeAreaId}
                areas={lifeAreas}
                onChange={setLifeAreaId}
                onManage={onManageLifeAreas}
              />
            </div>
          )}
        </div>

        {/* أزرار التنقل */}
        <div className="task-edit-wizard-footer">
          {step > 0 ? (
            <button type="button" className="small" onClick={goBack}>
              <DynamicIcon name="arrow-right" size={14} /> السابق
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              className={canNext() ? '' : 'disabled'}
              onClick={goNext}
              disabled={!canNext()}
            >
              التالي <DynamicIcon name="arrow-left" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? (
                <>
                  <DynamicIcon name="loader" size={14} /> جارِ الحفظ...
                </>
              ) : (
                <>
                  <DynamicIcon name="check" size={14} /> حفظ التعديلات
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

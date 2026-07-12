import { useEffect, useRef, useState } from 'react';
import { PriorityPicker } from './Priority';
import { CategoryPicker } from './Category';
import { LifeAreaPicker } from './LifeArea';
import { PriorityKey } from '../lib/priority';
import { CategoryKey } from '../lib/category';
import { LifeAreaData } from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';

interface Props {
  open: boolean;
  lifeAreas: LifeAreaData[];
  onClose: () => void;
  onManageLifeAreas: () => void;
  onCreate: (data: {
    title: string;
    priority: PriorityKey;
    category: CategoryKey | null;
    targetYear: number | null;
    lifeAreaId: string | null;
  }) => Promise<void> | void;
}

// نافذة إضافة مهمة رئيسية جديدة — تصميم من الصفر بديل النموذج القديم اللي
// كان مبعثر وعناصره بتتقطع على الهواتف. هنا كل حاجة في نافذة واحدة مرتبة:
// حقل العنوان أول حاجة وواضح، وبعده 3 خطوات اختيار مضغوطة (أولوية،
// تصنيف، مجال حياة) كل واحدة في قسم مستقل قابل للف على الشاشات الصغيرة،
// وزرار حفظ ثابت تحت دايمًا في متناول الإبهام على الموبايل.
export default function AddTaskModal({ open, lifeAreas, onClose, onManageLifeAreas, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PriorityKey>('MEDIUM');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const [lifeAreaId, setLifeAreaId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setPriority('MEDIUM');
      setCategory(null);
      setTargetYear(null);
      setLifeAreaId(null);
      setSubmitting(false);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    document.body.classList.add('modal-lock-scroll');
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.classList.remove('modal-lock-scroll');
    };
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate({ title: trimmed, priority, category, targetYear, lifeAreaId });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay add-task-overlay" onClick={onClose}>
      <div
        className="modal-box add-task-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-title"
      >
        <div className="add-task-header">
          <h2 id="add-task-title">
            <DynamicIcon name="sparkles" size={18} /> مهمة رئيسية جديدة
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <div className="add-task-body">
          <div className="add-task-field">
            <label htmlFor="add-task-input" className="add-task-label">
              اسم المهمة
            </label>
            <input
              id="add-task-input"
              ref={titleRef}
              className="add-task-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تجهيز عرض المشروع"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">الأولوية</span>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">التصنيف (اختياري)</span>
            <CategoryPicker
              value={category}
              targetYear={targetYear}
              onChange={(key, year) => {
                setCategory(key);
                setTargetYear(key === 'YEARLY' ? year ?? new Date().getFullYear() : null);
              }}
            />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">مجال الحياة (اختياري)</span>
            <LifeAreaPicker value={lifeAreaId} areas={lifeAreas} onChange={setLifeAreaId} onManage={onManageLifeAreas} />
          </div>
        </div>

        <div className="add-task-footer">
          <button className="small" type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="add-task-submit" type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'جاري الإضافة…' : 'إضافة المهمة'}
          </button>
        </div>
      </div>
    </div>
  );
}

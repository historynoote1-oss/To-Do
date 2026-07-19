import { useEffect, useRef, useState } from 'react';
import { createLifeArea } from '../lib/api';
import { LifeAreaData, DEFAULT_LIFE_AREA_COLOR, hexToGradient } from '../lib/lifeArea';
import { ColorGroups, IconGroups } from './LifeAreasManager';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (area: LifeAreaData) => void;
}

// نافذة صغيرة "فوق" ويزارد إنشاء المهمة — بتسمح للمستخدم ينشئ مجال حياة
// جديد من غير ما يخرج من إنشاء المهمة أو يفقد أي بيانات سبق إدخالها.
// بمجرد النجاح، المجال الجديد بيتضاف لقائمة المجالات وبيتحدد فورًا،
// والمستخدم بيرجع لنفس مرحلة "مجال الحياة" في الويزارد يكمل منها.
export default function QuickCreateLifeArea({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_LIFE_AREA_COLOR);
  const [icon, setIcon] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor(DEFAULT_LIFE_AREA_COLOR);
      setIcon('');
      setCreating(false);
      setError('');
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedName = name.trim();

  async function handleCreate() {
    if (!trimmedName) {
      setError('لازم تكتب اسم للمجال الأول');
      sounds.error();
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const area = await createLifeArea({ name: trimmedName, color, icon: icon || null });
      sounds.addItem();
      toast.success(`اتضاف مجال "${trimmedName}"`);
      onCreated(area);
      onClose();
    } catch (err) {
      sounds.error();
      const message = err instanceof Error ? err.message : 'تعذّر إنشاء المجال';
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay add-task-overlay quick-life-area-overlay" onClick={onClose}>
      <div
        className="modal-box add-task-modal quick-life-area-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-life-area-title"
      >
        <div className="add-task-header">
          <h2 id="quick-life-area-title">
            <span className="add-task-header-icon" style={{ background: hexToGradient(color), color: '#fff' }}>
              <DynamicIcon name={icon || 'compass'} size={20} strokeWidth={2.25} />
            </span>
            <span className="add-task-header-text">
              <span className="add-task-header-step">مجال حياة جديد</span>
              <span className="add-task-header-title">إنشاء مجال</span>
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <div className="add-task-body quick-life-area-body">
          <div className="add-task-field">
            <label htmlFor="quick-life-area-name" className="add-task-label">
              اسم المجال
            </label>
            <input
              id="quick-life-area-name"
              ref={nameRef}
              className="add-task-title-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="مثال: الصحة، الشغل، العائلة"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'quick-life-area-error' : undefined}
            />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">اللون</span>
            <ColorGroups value={color} onSelect={setColor} />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">الأيقونة (اختياري)</span>
            <IconGroups value={icon} onSelect={setIcon} />
          </div>

          {error && (
            <p className="wizard-step-error" role="alert" id="quick-life-area-error">
              <DynamicIcon name="alert" size={13} /> {error}
            </p>
          )}
        </div>

        <div className="add-task-footer">
          <button className="small" type="button" onClick={onClose} disabled={creating}>
            إلغاء
          </button>
          <button
            className="add-task-submit"
            type="button"
            onClick={handleCreate}
            disabled={creating || !trimmedName}
          >
            {creating ? 'جاري الإنشاء…' : 'إنشاء المجال'}
          </button>
        </div>
      </div>
    </div>
  );
}

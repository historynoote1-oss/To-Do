import { useEffect, useRef, useState } from 'react';
import { createLifeArea } from '@/services/api';
import { LifeAreaData, DEFAULT_LIFE_AREA_COLOR } from '@/utils/lifeArea';
import { AreaAvatar, IconGroups } from '@/pages/life-areas/LifeAreaShared';
import { ColorPicker } from '@/components/common/ColorPicker';
import Portal from '@/components/common/Portal';
import { DynamicIcon } from '@/utils/icons';
import { sounds } from '@/services/audio/sounds';
import { toast } from '@/utils/toast';

interface Props {
  open: boolean;
  onClose: () => void;
  // بيتنادى بعد ما المجال الرئيسي وكل مجالاته الفرعية يتنشئوا بنجاح —
  // بيبعت المجال الرئيسي وقائمة الفرعيين عشان الشاشة الأب تحدّث حالتها
  // المحلية على طول من غير ما تحتاج تعيد تحميل كل شيء من السيرفر.
  onCreated: (main: LifeAreaData, subs: LifeAreaData[]) => void;
}

type StepId = 'name' | 'subareas' | 'style' | 'review';

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: 'name', label: 'الاسم الرئيسي', icon: 'compass' },
  { id: 'subareas', label: 'المجالات الفرعية', icon: 'list-checks' },
  { id: 'style', label: 'الشكل واللون', icon: 'palette' },
  { id: 'review', label: 'المراجعة', icon: 'check' },
];

// ويزارد إنشاء مجال حياة خطوة-بخطوة — بنفس فلسفة ويزارد إضافة مهمة
// (AddTaskModal): كل حاجة على مراحل مستقلة بدل نموذج واحد طويل.
// الترتيب: (١) اسم المجال الرئيسي → (٢) مجالاته الفرعية (اختياري، قابلة
// للإضافة أكتر من واحد) → (٣) الأيقونة واللون مع معاينة حية فورية →
// (٤) مراجعة نهائية وإنشاء. المجالات الفرعية بتاخد نفس اللون/الأيقونة
// اللي المستخدم اختارهم للرئيسي (يقدر يعدّل كل واحد لوحده بعدين من
// الشجرة العادية) — كده الويزارد بيفضل بسيط وسريع من غير ما يطلب من
// المستخدم يكرر نفس الاختيار لكل فرع.
export default function LifeAreaWizard({ open, onClose, onCreated }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [subAreas, setSubAreas] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState('');
  const [color, setColor] = useState(DEFAULT_LIFE_AREA_COLOR);
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setName('');
      setSubAreas([]);
      setSubDraft('');
      setColor(DEFAULT_LIFE_AREA_COLOR);
      setIcon('');
      setSubmitting(false);
      setStepError('');
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const trimmedName = name.trim();

  function addSubArea() {
    const value = subDraft.trim();
    if (!value) return;
    if (subAreas.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setStepError('المجال الفرعي ده مكتوب بالفعل');
      sounds.error();
      return;
    }
    setSubAreas((prev) => [...prev, value]);
    setSubDraft('');
    setStepError('');
    sounds.hover();
    requestAnimationFrame(() => subInputRef.current?.focus());
  }

  function removeSubArea(index: number) {
    setSubAreas((prev) => prev.filter((_, i) => i !== index));
  }

  function validateStep(): string | null {
    if (step.id === 'name' && !trimmedName) return 'لازم تكتب اسم المجال الرئيسي الأول';
    return null;
  }

  function goNext() {
    const err = validateStep();
    if (err) {
      setStepError(err);
      sounds.error();
      return;
    }
    setStepError('');
    sounds.hover();
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }

  function goBack() {
    setStepError('');
    if (isFirst) {
      if (!submitting) onClose();
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goToStep(index: number) {
    if (index >= stepIndex) return;
    setStepError('');
    setStepIndex(index);
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) {
      setStepError(err);
      sounds.error();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setStepError('');
    try {
      const main = await createLifeArea({ name: trimmedName, color, icon: icon || null, parentId: null });
      const createdSubs: LifeAreaData[] = [];
      let failedCount = 0;
      for (const subName of subAreas) {
        try {
          const sub = await createLifeArea({ name: subName, color, icon: icon || null, parentId: main.id });
          createdSubs.push(sub);
        } catch {
          failedCount += 1;
        }
      }
      sounds.addItem();
      if (failedCount > 0) {
        toast.error(`اتنشأ المجال لكن ${failedCount} من الفروع تعذّر إنشاؤها — تقدر تضيفهم بعدين يدوي`);
      } else {
        toast.success(
          createdSubs.length > 0
            ? `اتنشأ مجال "${trimmedName}" مع ${createdSubs.length} مجال فرعي`
            : `اتنشأ مجال "${trimmedName}"`
        );
      }
      onCreated(main, createdSubs);
      onClose();
    } catch (err2) {
      sounds.error();
      const message = err2 instanceof Error ? err2.message : 'تعذّر إنشاء المجال';
      setStepError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Portal>
      <div className="modal-overlay add-task-overlay" onClick={() => !submitting && onClose()}>
        <div
          className="modal-box add-task-modal life-area-wizard-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="life-area-wizard-title"
        >
          <div className="add-task-header">
            <h2 id="life-area-wizard-title">
              <span className="add-task-header-icon" style={{ background: color, color: '#fff' }}>
                <DynamicIcon name={step.icon} size={20} strokeWidth={2.25} />
              </span>
              <span className="add-task-header-text">
                <span className="add-task-header-step">
                  الخطوة {stepIndex + 1} من {STEPS.length}
                </span>
                <span className="add-task-header-title">{step.label}</span>
              </span>
            </h2>
            <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق" disabled={submitting}>
              <DynamicIcon name="x" size={16} />
            </button>
          </div>

          <div className="wizard-steps" role="tablist" aria-label="مراحل إنشاء مجال الحياة">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`wizard-step-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
                onClick={() => goToStep(i)}
                disabled={i > stepIndex}
                aria-label={s.label}
                aria-current={i === stepIndex}
                title={s.label}
              >
                {i < stepIndex ? <DynamicIcon name="check" size={11} /> : <span>{i + 1}</span>}
              </button>
            ))}
          </div>

          <div className="add-task-body">
            {step.id === 'name' && (
              <div className="add-task-field">
                <label htmlFor="life-area-wizard-name" className="add-task-label">
                  اسم مجال الحياة الرئيسي
                </label>
                <input
                  id="life-area-wizard-name"
                  ref={nameRef}
                  className="add-task-title-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (stepError) setStepError('');
                  }}
                  placeholder="مثلاً: الصحة واللياقة، الشغل، العائلة"
                  maxLength={40}
                  onKeyDown={(e) => e.key === 'Enter' && goNext()}
                />
                <p className="wizard-empty-hint">
                  ده الاسم اللي هيظهر ككارت رئيسي في صفحة مجالات الحياة، وممكن تحط تحته مجالات فرعية في الخطوة الجاية.
                </p>
              </div>
            )}

            {step.id === 'subareas' && (
              <div className="add-task-field">
                <label className="add-task-label">
                  مجالات فرعية تحت "{trimmedName || 'المجال الرئيسي'}" <span className="modal-hint">(اختياري)</span>
                </label>
                <div className="life-area-wizard-sub-input-row">
                  <input
                    ref={subInputRef}
                    className="add-task-title-input"
                    value={subDraft}
                    onChange={(e) => {
                      setSubDraft(e.target.value);
                      if (stepError) setStepError('');
                    }}
                    placeholder="مثلاً: الرياضة، الأكل الصحي، النوم"
                    maxLength={40}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubArea();
                      }
                    }}
                  />
                  <button type="button" className="small" onClick={addSubArea} disabled={!subDraft.trim()}>
                    <DynamicIcon name="plus" size={14} /> إضافة
                  </button>
                </div>

                {subAreas.length === 0 ? (
                  <p className="wizard-empty-hint">
                    لسه مفيش مجالات فرعية. تقدر تضيف أكتر من واحد وترتبهم بعدين، أو تعدّي الخطوة دي لو مش محتاجها.
                  </p>
                ) : (
                  <ul className="life-area-wizard-sub-list">
                    {subAreas.map((s, i) => (
                      <li key={`${s}-${i}`} className="life-area-wizard-sub-chip">
                        <AreaAvatar color={color} icon={icon || 'tag'} size={26} iconSize={13} />
                        <span>{s}</span>
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => removeSubArea(i)}
                          aria-label={`حذف ${s}`}
                          title="حذف"
                        >
                          <DynamicIcon name="x" size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {step.id === 'style' && (
              <div className="add-task-field">
                <div className="life-area-wizard-live-preview">
                  <AreaAvatar color={color} icon={icon || 'tag'} size={72} iconSize={30} />
                  <strong>{trimmedName || 'مجال الحياة'}</strong>
                  {subAreas.length > 0 && (
                    <div className="life-area-wizard-live-subs">
                      {subAreas.map((s, i) => (
                        <span key={`${s}-${i}`} className="life-area-wizard-live-sub-chip">
                          <AreaAvatar color={color} icon={icon || 'tag'} size={22} iconSize={11} />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <label className="add-task-label">اللون</label>
                <ColorPicker value={color} onChange={setColor} />

                <label className="add-task-label">الأيقونة</label>
                <IconGroups value={icon} onSelect={setIcon} />
              </div>
            )}

            {step.id === 'review' && (
              <div className="add-task-field">
                <p className="wizard-empty-hint">راجع بيانات المجال قبل الإنشاء — تقدر ترجع لأي خطوة تعدّل فيها.</p>
                <div className="life-area-wizard-review-main">
                  <AreaAvatar color={color} icon={icon || 'tag'} size={56} iconSize={24} />
                  <div>
                    <strong>{trimmedName}</strong>
                    <span className="modal-hint">مجال حياة رئيسي</span>
                  </div>
                </div>

                {subAreas.length > 0 && (
                  <div className="wizard-review">
                    <div className="wizard-review-row">
                      <span className="wizard-review-label">المجالات الفرعية ({subAreas.length})</span>
                    </div>
                    <ul className="life-area-wizard-sub-list">
                      {subAreas.map((s, i) => (
                        <li key={`${s}-${i}`} className="life-area-wizard-sub-chip is-review">
                          <AreaAvatar color={color} icon={icon || 'tag'} size={26} iconSize={13} />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {stepError && (
              <p className="wizard-step-error" role="alert">
                <DynamicIcon name="alert" size={13} /> {stepError}
              </p>
            )}
          </div>

          <div className="add-task-footer">
            <button className="small" type="button" onClick={goBack} disabled={submitting}>
              {isFirst ? 'إلغاء' : 'رجوع'}
            </button>
            {isLast ? (
              <button className="add-task-submit" type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'جاري الإنشاء…' : subAreas.length > 0 ? 'إنشاء المجال والفروع' : 'إنشاء المجال'}
              </button>
            ) : (
              <button className="add-task-submit" type="button" onClick={goNext}>
                التالي
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

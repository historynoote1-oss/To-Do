import { useEffect, useRef, useState } from 'react';
import { createLifeArea, updateLifeArea, deleteLifeArea, reorderLifeAreas } from '@/services/api';
import { LifeAreaData, DEFAULT_LIFE_AREA_COLOR } from '@/utils/lifeArea';
import { AreaAvatar, IconGroups } from '@/pages/life-areas/LifeAreaShared';
import { ColorPicker } from '@/components/common/ColorPicker';
import Portal from '@/components/common/Portal';
import { DynamicIcon } from '@/utils/icons';
import { sounds } from '@/services/audio/sounds';
import { toast } from '@/utils/toast';

// عنصر مجال فرعي جوه الويزارد — id موجود لو ده مجال فرعي حقيقي موجود
// بالفعل (وضع التعديل)، وغير موجود لو المستخدم لسه ضايفه دلوقتي (هيتنشئ
// عند الحفظ). بالاعتماد على الفرق ده بنعرف بالظبط مين نعمله create ومين
// نعمله update عند الحفظ في وضع التعديل.
interface SubAreaDraft {
  id?: string;
  name: string;
}

interface EditingPayload {
  main: LifeAreaData;
  subs: LifeAreaData[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  // لو موجودة، الويزارد بيفتح في "وضع التعديل" معبّى ببيانات المجال ده
  // بالظبط (اسم + فرعيين + لون + أيقونة)، وأي تعديل بيتطبّق على نفس
  // المجال (مش إنشاء واحد جديد).
  editing?: EditingPayload | null;
  // بيتنادى بعد ما المجال الرئيسي وكل مجالاته الفرعية يتنشئوا بنجاح —
  // بيبعت المجال الرئيسي وقائمة الفرعيين عشان الشاشة الأب تحدّث حالتها
  // المحلية على طول من غير ما تحتاج تعيد تحميل كل شيء من السيرفر.
  onCreated: (main: LifeAreaData, subs: LifeAreaData[]) => void;
  // بيتنادى بعد ما تعديل مجال موجود يتحفظ بنجاح — بيبعت النسخة المحدّثة
  // من المجال الرئيسي، والقائمة *النهائية* الكاملة لفرعيّه بعد أي إضافة/
  // حذف/إعادة ترتيب (مش الفروقات، القائمة الجاهزة النهائية).
  onSaved: (main: LifeAreaData, subs: LifeAreaData[]) => void;
}

type StepId = 'name' | 'subareas' | 'style' | 'review';

const STEPS: { id: StepId; label: string; icon: string }[] = [
  { id: 'name', label: 'الاسم الرئيسي', icon: 'compass' },
  { id: 'subareas', label: 'المجالات الفرعية', icon: 'list-checks' },
  { id: 'style', label: 'الشكل واللون', icon: 'palette' },
  { id: 'review', label: 'المراجعة', icon: 'check' },
];

// ويزارد إنشاء/تعديل مجال حياة خطوة-بخطوة — بنفس فلسفة ويزارد إضافة مهمة
// (AddTaskModal): كل حاجة على مراحل مستقلة بدل نموذج واحد طويل.
// الترتيب: (١) اسم المجال الرئيسي → (٢) مجالاته الفرعية (إضافة/حذف/
// إعادة ترتيب) → (٣) الأيقونة واللون مع معاينة حية فورية → (٤) مراجعة
// نهائية وحفظ. المجالات الفرعية الجديدة بتاخد نفس اللون/الأيقونة اللي
// المستخدم اختارهم للرئيسي — وبما إن المجالات الفرعية بقت من غير أيقونات
// في العرض أصلاً، الموضوع بيفضل بسيط من غير ما يطلب من المستخدم يختار
// حاجة لكل فرع لوحده.
//
// ===== ترتيب المجالات الفرعية بيتم *هنا بس* (خطوة المجالات الفرعية،
// بأسهم لأعلى/لأسفل) — الكارت المعروض في الصفحة الرئيسية بقى للعرض
// والتنقّل بس، مفيش سحب/إفلات أو أزرار ترتيب عليه. =====
export default function LifeAreaWizard({ open, onClose, editing, onCreated, onSaved }: Props) {
  const isEditMode = !!editing;

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [subAreas, setSubAreas] = useState<SubAreaDraft[]>([]);
  const [subDraft, setSubDraft] = useState('');
  const [color, setColor] = useState(DEFAULT_LIFE_AREA_COLOR);
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStepIndex(0);
      setName(editing.main.name);
      setColor(editing.main.color || DEFAULT_LIFE_AREA_COLOR);
      setIcon(editing.main.icon || '');
      setSubAreas(
        [...editing.subs]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ id: s.id, name: s.name }))
      );
    } else {
      setStepIndex(0);
      setName('');
      setSubAreas([]);
      setColor(DEFAULT_LIFE_AREA_COLOR);
      setIcon('');
    }
    setSubDraft('');
    setSubmitting(false);
    setStepError('');
    requestAnimationFrame(() => nameRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

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

  // المجالات الفرعية الأصلية (وضع التعديل بس) اللي اتشالت من القائمة —
  // دي هتتحذف فعليًا لما المستخدم يحفظ، فبنوريها كتحذير واضح في المراجعة.
  const removedSubs = editing ? editing.subs.filter((s) => !subAreas.some((d) => d.id === s.id)) : [];

  function addSubArea() {
    const value = subDraft.trim();
    if (!value) return;
    if (subAreas.some((s) => s.name.toLowerCase() === value.toLowerCase())) {
      setStepError('المجال الفرعي ده مكتوب بالفعل');
      sounds.error();
      return;
    }
    setSubAreas((prev) => [...prev, { name: value }]);
    setSubDraft('');
    setStepError('');
    sounds.hover();
    requestAnimationFrame(() => subInputRef.current?.focus());
  }

  function removeSubArea(index: number) {
    setSubAreas((prev) => prev.filter((_, i) => i !== index));
  }

  function moveSubArea(index: number, direction: -1 | 1) {
    setSubAreas((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    sounds.hover();
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

  async function handleCreateSubmit() {
    const main = await createLifeArea({ name: trimmedName, color, icon: icon || null, parentId: null });
    const createdSubs: LifeAreaData[] = [];
    let failedCount = 0;
    for (const draft of subAreas) {
      try {
        const sub = await createLifeArea({ name: draft.name, color, icon: icon || null, parentId: main.id });
        createdSubs.push(sub);
      } catch {
        failedCount += 1;
      }
    }
    sounds.addItem();
    if (failedCount > 0) {
      toast.error(`اتنشأ المجال لكن ${failedCount} من الفروع تعذّر إنشاؤها — تقدر تضيفهم بعدين من زر التعديل`);
    } else {
      toast.success(
        createdSubs.length > 0
          ? `اتنشأ مجال "${trimmedName}" مع ${createdSubs.length} مجال فرعي`
          : `اتنشأ مجال "${trimmedName}"`
      );
    }
    onCreated(main, createdSubs);
  }

  async function handleEditSubmit() {
    if (!editing) return;
    const nameChanged = editing.main.name !== trimmedName;
    const colorChanged = editing.main.color !== color;
    const iconChanged = (editing.main.icon || '') !== icon;
    const main =
      nameChanged || colorChanged || iconChanged
        ? await updateLifeArea(editing.main.id, { name: trimmedName, color, icon: icon || null })
        : editing.main;

    let failedCount = 0;

    // فروع اتشالت من القايمة في الويزارد → بتتحذف فعليًا دلوقتي.
    for (const removed of removedSubs) {
      try {
        await deleteLifeArea(removed.id);
      } catch {
        failedCount += 1;
      }
    }

    // باقي الفروع: تحديث اسم لو اتغيّر، أو إنشاء جديد لو لسه من غير id.
    const finalSubs: LifeAreaData[] = [];
    for (const draft of subAreas) {
      try {
        if (draft.id) {
          const original = editing.subs.find((s) => s.id === draft.id);
          if (original && original.name !== draft.name) {
            const updated = await updateLifeArea(draft.id, { name: draft.name });
            finalSubs.push(updated);
          } else if (original) {
            finalSubs.push(original);
          }
        } else {
          const created = await createLifeArea({ name: draft.name, color, icon: icon || null, parentId: main.id });
          finalSubs.push(created);
        }
      } catch {
        failedCount += 1;
      }
    }

    // بيحفظ الترتيب النهائي اللي المستخدم رتّبه في الويزارد (بالأسهم).
    if (finalSubs.length > 0) {
      try {
        await reorderLifeAreas(finalSubs.map((s) => s.id), main.id);
        finalSubs.forEach((s, i) => (s.position = i));
      } catch {
        /* الترتيب مش حرج — لو فشل هيفضل الترتيب القديم، من غير ما نوقف الحفظ كله */
      }
    }

    sounds.click();
    if (failedCount > 0) {
      toast.error(`اتحفظ التعديل لكن ${failedCount} عملية على الفروع تعذّرت — راجع المجال تاني`);
    } else {
      toast.success(`اتحفظت تعديلات "${trimmedName}"`);
    }
    onSaved(main, finalSubs);
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
      if (isEditMode) await handleEditSubmit();
      else await handleCreateSubmit();
      onClose();
    } catch (err2) {
      sounds.error();
      const message = err2 instanceof Error ? err2.message : 'تعذّر حفظ مجال الحياة';
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
                  {isEditMode ? 'تعديل مجال حياة' : 'مجال حياة جديد'} · الخطوة {stepIndex + 1} من {STEPS.length}
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
                  ده الاسم اللي هيظهر فوق الكارت، وممكن تحط تحته مجالات فرعية في الخطوة الجاية.
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
                    لسه مفيش مجالات فرعية. تقدر تضيف أكتر من واحد وترتّبهم بالأسهم، أو تعدّي الخطوة دي لو مش محتاجها.
                  </p>
                ) : (
                  <>
                    <ul className="life-area-wizard-sub-list">
                      {subAreas.map((s, i) => (
                        <li key={s.id ?? `new-${i}`} className="life-area-wizard-sub-chip">
                          <div className="life-area-wizard-sub-order">
                            <button
                              type="button"
                              className="icon-btn small"
                              onClick={() => moveSubArea(i, -1)}
                              disabled={i === 0}
                              aria-label={`نقل "${s.name}" لأعلى`}
                              title="نقل لأعلى"
                            >
                              <DynamicIcon name="chevron-up" size={12} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn small"
                              onClick={() => moveSubArea(i, 1)}
                              disabled={i === subAreas.length - 1}
                              aria-label={`نقل "${s.name}" لأسفل`}
                              title="نقل لأسفل"
                            >
                              <DynamicIcon name="chevron-down" size={12} />
                            </button>
                          </div>
                          <span>{s.name}</span>
                          <button
                            type="button"
                            className="icon-btn small"
                            onClick={() => removeSubArea(i)}
                            aria-label={`حذف ${s.name}`}
                            title="حذف"
                          >
                            <DynamicIcon name="x" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {isEditMode && (
                      <p className="wizard-empty-hint">
                        رتّب الفروع بالأسهم زي ما تحبّ — الترتيب ده هو اللي هيظهر بيه على الكارت. أي فرع تشيله من هنا هيتحذف فعليًا لما تحفظ.
                      </p>
                    )}
                  </>
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
                        <span key={s.id ?? `new-${i}`} className="life-area-wizard-live-sub-chip">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <label className="add-task-label">اللون</label>
                <ColorPicker value={color} onChange={setColor} />

                <label className="add-task-label">الأيقونة</label>
                <IconGroups value={icon} onSelect={setIcon} />
                <p className="wizard-empty-hint">
                  الشكل واللون ده بيتطبّق على المجال الرئيسي، وعلى أي مجال فرعي جديد هتضيفه (المجالات الفرعية نفسها بتتعرض من غير أيقونة).
                </p>
              </div>
            )}

            {step.id === 'review' && (
              <div className="add-task-field">
                <p className="wizard-empty-hint">راجع بيانات المجال قبل الحفظ — تقدر ترجع لأي خطوة تعدّل فيها.</p>
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
                    <ul className="life-area-wizard-sub-list is-review">
                      {subAreas.map((s, i) => (
                        <li key={s.id ?? `new-${i}`} className="life-area-wizard-sub-chip is-review">
                          <span>{s.name}</span>
                          {!s.id && <span className="life-area-wizard-sub-badge is-new">جديد</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {removedSubs.length > 0 && (
                  <div className="wizard-review">
                    <div className="wizard-review-row">
                      <span className="wizard-review-label wizard-review-label-danger">
                        <DynamicIcon name="alert" size={12} /> هيتحذف نهائيًا ({removedSubs.length})
                      </span>
                    </div>
                    <ul className="life-area-wizard-sub-list is-review">
                      {removedSubs.map((s) => (
                        <li key={s.id} className="life-area-wizard-sub-chip is-review is-danger">
                          <span>{s.name}</span>
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
                {submitting
                  ? 'جاري الحفظ…'
                  : isEditMode
                    ? 'حفظ التعديلات'
                    : subAreas.length > 0
                      ? 'إنشاء المجال والفروع'
                      : 'إنشاء المجال'}
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

import { useEffect, useRef, useState } from 'react';
import {
  getLifeAreas,
  createLifeArea,
  updateLifeArea,
  deleteLifeArea,
  reorderLifeAreas,
  uploadLifeAreaIcon,
  removeLifeAreaIcon,
  resolveLifeAreaImageUrl,
} from '../lib/api';
import {
  LifeAreaData,
  LIFE_AREA_COLOR_GROUPS,
  LIFE_AREA_ICON_PRESETS,
  DEFAULT_LIFE_AREA_COLOR,
  hexToGradient,
} from '../lib/lifeArea';
import { DynamicIcon } from '../lib/icons';
import { toast } from '../lib/toast';
import { sounds } from '../lib/sounds';
import ConfirmModal from './ConfirmModal';

const ALLOWED_ICON_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ICON_IMAGE_BYTES = 2 * 1024 * 1024;

interface AreaFormState {
  name: string;
  color: string;
  icon: string;
}

const EMPTY_FORM: AreaFormState = { name: '', color: DEFAULT_LIFE_AREA_COLOR, icon: '' };

// شارة معاينة (Avatar) موحّدة — نفس فلسفة AreaGlyph في LifeArea.tsx، لكن
// بمقاس أكبر ومرن (px) عشان تتستخدم في نموذج الإنشاء/التعديل كمعاينة حية
// وفي كارت المجال في القائمة. لو فيه صورة بتتعرض هي، ولو أيقونة بس
// بتتحط جوه دائرة بتدرج لوني متولّد من لون المجال.
function AreaAvatar({
  color,
  icon,
  imageUrl,
  size = 44,
  iconSize = 20,
}: {
  color: string;
  icon: string | null | undefined;
  imageUrl?: string | null;
  size?: number;
  iconSize?: number;
}) {
  if (imageUrl) {
    return (
      <span
        className="life-area-avatar life-area-avatar-img"
        style={{ width: size, height: size, borderRadius: size / 3.2 }}
      >
        <img src={imageUrl} alt="" />
      </span>
    );
  }
  return (
    <span
      className="life-area-avatar"
      style={{ width: size, height: size, borderRadius: size / 3.2, background: hexToGradient(color) }}
    >
      <DynamicIcon name={icon || 'tag'} size={iconSize} className="life-area-avatar-icon" />
    </span>
  );
}

// ===== شبكة الألوان المُقسّمة لعائلات — بتُستخدم في نموذج الإنشاء والتعديل.
// معرّفة برا الكومبوننت الرئيسي عشان تحتفظ بهويتها بين كل render (لو
// اتعرّفت جوه، ريأكت كان هيعمل remount كامل ليها كل مرة وده كان هيكسر
// التفاعل مع input[type=color]). =====
function ColorGroups({ value, onSelect }: { value: string; onSelect: (color: string) => void }) {
  return (
    <div className="life-area-color-groups">
      {LIFE_AREA_COLOR_GROUPS.map((group) => (
        <div key={group.label} className="life-area-color-group">
          <span className="life-area-color-group-label">{group.label}</span>
          <div className="life-area-color-grid">
            {group.colors.map((c) => (
              <button
                key={c}
                type="button"
                className={`life-area-color-swatch ${value === c ? 'selected' : ''}`}
                style={{ background: hexToGradient(c) }}
                onClick={() => onSelect(c)}
                aria-label={`اختيار اللون ${c}`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="life-area-color-group">
        <span className="life-area-color-group-label">لون مخصص</span>
        <div className="life-area-color-grid">
          <label className="life-area-color-custom" title="لون مخصص" style={{ background: hexToGradient(value) }}>
            <input type="color" value={value} onChange={(e) => onSelect(e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ===== شبكة الأيقونات (بدون أي إيموجي — Lucide فقط) — نفس السبب برا الكومبوننت =====
function IconGrid({ value, onSelect }: { value: string; onSelect: (icon: string) => void }) {
  return (
    <div className="life-area-icon-grid">
      {LIFE_AREA_ICON_PRESETS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`life-area-icon-choice ${value === icon ? 'selected' : ''}`}
          onClick={() => onSelect(icon)}
          aria-label={`اختيار الأيقونة ${icon}`}
          title={icon}
        >
          <DynamicIcon name={icon} size={18} />
        </button>
      ))}
    </div>
  );
}

export default function LifeAreasManager({ onBack, onChange }: { onBack: () => void; onChange?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<LifeAreaData[]>([]);
  const [createForm, setCreateForm] = useState<AreaFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  // ملف الصورة اللي المستخدم اختاره أثناء تعبئة نموذج الإنشاء — لسه معندناش
  // ID للمجال (لسه ملتاسّسش)، فبنحتفظ بالملف محليًا ونعاينه، وبعد ما
  // المجال يتنشئ فعليًا بنرفعه فورًا في نفس عملية الإنشاء (نقرة واحدة من
  // وجهة نظر المستخدم = "اختار صورة قبل إنشاء المجال").
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const createFileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AreaFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [confirmDeleteArea, setConfirmDeleteArea] = useState<LifeAreaData | null>(null);
  const [reordering, setReordering] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    load();
  }, []);

  // بتنضّف الـ object URL بتاع معاينة الصورة عند الخروج من الصفحة، عشان
  // منسبّبش تسريب ذاكرة (memory leak) في المتصفح.
  useEffect(() => {
    return () => {
      if (createImagePreview) URL.revokeObjectURL(createImagePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getLifeAreas();
      setAreas(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل مجالات الحياة');
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    onChange?.();
  }

  function validateImageFile(file: File): string | null {
    if (!ALLOWED_ICON_IMAGE_TYPES.includes(file.type)) {
      return 'نوع الصورة لازم يكون JPG أو PNG أو WEBP أو GIF';
    }
    if (file.size > MAX_ICON_IMAGE_BYTES) {
      return 'حجم الصورة أكبر من الحد المسموح (2 ميجابايت)';
    }
    return null;
  }

  function handlePickCreateImage() {
    createFileInputRef.current?.click();
  }

  function handleCreateImageSelected(file: File | undefined) {
    if (!file) return;
    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    if (createImagePreview) URL.revokeObjectURL(createImagePreview);
    setCreateImageFile(file);
    setCreateImagePreview(URL.createObjectURL(file));
  }

  function handleClearCreateImage() {
    if (createImagePreview) URL.revokeObjectURL(createImagePreview);
    setCreateImageFile(null);
    setCreateImagePreview(null);
    if (createFileInputRef.current) createFileInputRef.current.value = '';
  }

  async function handleCreate() {
    const name = createForm.name.trim();
    if (!name) {
      toast.error('لازم تكتب اسم للمجال الأول');
      return;
    }
    setCreating(true);
    try {
      let area = await createLifeArea({ name, color: createForm.color, icon: createForm.icon || null });
      // لو المستخدم اختار صورة قبل الإنشاء، بنرفعها فورًا بعد ما المجال
      // يتنشئ — من وجهة نظر المستخدم دي خطوة واحدة (اختيار + إنشاء).
      if (createImageFile) {
        try {
          area = await uploadLifeAreaIcon(area.id, createImageFile);
        } catch (uploadErr) {
          toast.error(uploadErr instanceof Error ? uploadErr.message : 'اتنشأ المجال لكن تعذّر رفع الصورة');
        }
      }
      setAreas((prev) => [...prev, area]);
      setCreateForm(EMPTY_FORM);
      handleClearCreateImage();
      sounds.addItem();
      toast.success(`اتضاف مجال "${name}"`);
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء المجال');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(area: LifeAreaData) {
    setEditingId(area.id);
    setEditForm({ name: area.name, color: area.color, icon: area.icon || '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(id: string) {
    const name = editForm.name.trim();
    if (!name) {
      toast.error('اسم المجال مينفعش يبقى فاضي');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateLifeArea(id, { name, color: editForm.color, icon: editForm.icon || null });
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...updated, stats: a.stats } : a)));
      setEditingId(null);
      sounds.click();
      toast.success('اتحدّث المجال');
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تعديل المجال');
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDelete(area: LifeAreaData) {
    setConfirmDeleteArea(area);
  }

  async function confirmDeleteNow() {
    const area = confirmDeleteArea;
    setConfirmDeleteArea(null);
    if (!area) return;
    const snapshot = areas;
    sounds.deleteItem();
    setAreas((prev) => prev.filter((a) => a.id !== area.id));
    try {
      await deleteLifeArea(area.id);
      toast.info(`اتحذف مجال "${area.name}" — مهامه رجعت "بدون مجال"`);
      notifyChanged();
    } catch (err) {
      setAreas(snapshot);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المجال');
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const index = areas.findIndex((a) => a.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= areas.length) return;
    const next = [...areas];
    [next[index], next[target]] = [next[target], next[index]];
    setAreas(next);
    setReordering(true);
    sounds.hover();
    try {
      await reorderLifeAreas(next.map((a) => a.id));
    } catch (err) {
      setAreas(areas);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ الترتيب الجديد');
    } finally {
      setReordering(false);
    }
  }

  function handlePickImage(id: string) {
    fileInputRefs.current[id]?.click();
  }

  async function handleImageSelected(id: string, file: File | undefined) {
    if (!file) return;
    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setUploadingId(id);
    try {
      const updated = await uploadLifeAreaIcon(id, file);
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...updated, stats: a.stats } : a)));
      toast.success('اتحدّثت صورة الأيقونة');
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setUploadingId(null);
    }
  }

  async function handleRemoveImage(id: string) {
    setUploadingId(id);
    try {
      const updated = await removeLifeAreaIcon(id);
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...updated, stats: a.stats } : a)));
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الصورة');
    } finally {
      setUploadingId(null);
    }
  }

  // ===== شبكة الألوان والأيقونات مُعرّفة برا الكومبوننت (تحت) عشان محدش
  // يعيد إنشاءها مع كل render — لو اتعرّفت جوه هنا، ريأكت هيعتبرها نوع
  // كومبوننت جديد كل مرة ويعمل remount كامل للشبكة (يفقد الفوكس من
  // input[type=color] مثلاً). =====

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <button className="small" onClick={onBack} type="button">
          رجوع
        </button>
        <strong>مجالات الحياة</strong>
        <span aria-hidden="true" style={{ width: 0 }} />
      </div>

      <div className="life-area-intro">
        <DynamicIcon name="compass" size={28} className="life-area-intro-icon" />
        <div>
          <h1>مجالات الحياة</h1>
          <p>
            نظّم مهامك حسب جوانب حياتك المختلفة — صحة، شغل، عائلة، تعلّم، وأي حاجة تانية تهمك. أنشئ عدد غير محدود من
            المجالات، رتّبهم زي ما تحب، وتابع تقدمك في كل واحد منهم على حدة.
          </p>
        </div>
      </div>

      {/* ===== نموذج إنشاء مجال جديد ===== */}
      <div className="admin-panel profile-section life-area-create-panel">
        <h2><DynamicIcon name="plus" size={18} /> مجال جديد</h2>

        <div className="life-area-create-layout">
          <div className="life-area-create-preview-col">
            <button
              type="button"
              className="life-area-avatar-picker"
              onClick={handlePickCreateImage}
              disabled={creating}
              title="اضغط لاختيار صورة مخصصة"
            >
              <AreaAvatar
                color={createForm.color}
                icon={createForm.icon || 'tag'}
                imageUrl={createImagePreview}
                size={64}
                iconSize={26}
              />
              <span className="life-area-avatar-picker-badge">
                <DynamicIcon name="camera" size={12} />
              </span>
            </button>
            <input
              ref={createFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => handleCreateImageSelected(e.target.files?.[0])}
            />
            {createImagePreview ? (
              <button type="button" className="small danger life-area-avatar-clear" onClick={handleClearCreateImage}>
                إزالة الصورة
              </button>
            ) : (
              <span className="modal-hint life-area-avatar-hint">اختياري: صورة بدل الأيقونة</span>
            )}
          </div>

          <div className="life-area-create-fields">
            <div className="settings-field">
              <label>اسم المجال</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: الصحة واللياقة"
                maxLength={40}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="settings-field">
              <label>اللون</label>
              <ColorGroups value={createForm.color} onSelect={(color) => setCreateForm((f) => ({ ...f, color }))} />
            </div>
            <div className="settings-field">
              <label>الأيقونة {createImagePreview && <span className="modal-hint">(هتتستخدم الصورة اللي اخترتها بدلها)</span>}</label>
              <IconGrid value={createForm.icon} onSelect={(icon) => setCreateForm((f) => ({ ...f, icon }))} />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={handleCreate} disabled={creating || !createForm.name.trim()} type="button">
            {creating ? 'جاري الإنشاء...' : 'إنشاء المجال'}
          </button>
        </div>
      </div>

      {/* ===== قائمة المجالات الحالية ===== */}
      {loading && (
        <div className="lists-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {!loading && areas.length === 0 && (
        <p className="empty">
          <DynamicIcon name="compass" size={32} className="empty-icon" />
          لسه مفيش مجالات حياة، ابدأ بإنشاء أول مجال فوق
        </p>
      )}

      {!loading && areas.length > 0 && (
        <div className="life-area-list">
          {areas.map((area, index) => {
            const isEditing = editingId === area.id;
            const isUploading = uploadingId === area.id;
            return (
              <div key={area.id} className="life-area-card" style={{ ['--card-accent' as any]: area.color }}>
                <div className="life-area-card-reorder">
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={() => move(area.id, -1)}
                    disabled={index === 0 || reordering}
                    aria-label="نقل لأعلى"
                    title="نقل لأعلى"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={() => move(area.id, 1)}
                    disabled={index === areas.length - 1 || reordering}
                    aria-label="نقل لأسفل"
                    title="نقل لأسفل"
                  >
                    ▼
                  </button>
                </div>

                <div className="life-area-card-glyph-wrap">
                  <AreaAvatar
                    color={area.color}
                    icon={area.icon}
                    imageUrl={resolveLifeAreaImageUrl(area.imageUrl)}
                    size={52}
                    iconSize={24}
                  />
                  {isUploading && <span className="avatar-upload-spinner" aria-hidden="true" />}
                </div>

                <div className="life-area-card-body">
                  {isEditing ? (
                    <div className="life-area-edit-form">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        maxLength={40}
                        autoFocus
                      />
                      <label className="life-area-edit-subtitle">اللون</label>
                      <ColorGroups value={editForm.color} onSelect={(color) => setEditForm((f) => ({ ...f, color }))} />
                      <label className="life-area-edit-subtitle">الأيقونة</label>
                      <IconGrid value={editForm.icon} onSelect={(icon) => setEditForm((f) => ({ ...f, icon }))} />
                      <div className="life-area-image-actions">
                        <button
                          type="button"
                          className="small"
                          onClick={() => handlePickImage(area.id)}
                          disabled={isUploading}
                        >
                          <DynamicIcon name="camera" size={14} /> {area.imageUrl ? 'تغيير الصورة' : 'رفع صورة مخصصة'}
                        </button>
                        {area.imageUrl && (
                          <button
                            type="button"
                            className="small danger"
                            onClick={() => handleRemoveImage(area.id)}
                            disabled={isUploading}
                          >
                            حذف الصورة
                          </button>
                        )}
                        <input
                          ref={(el) => (fileInputRefs.current[area.id] = el)}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          hidden
                          onChange={(e) => handleImageSelected(area.id, e.target.files?.[0])}
                        />
                      </div>
                      <div className="modal-actions">
                        <button className="small" onClick={cancelEdit} type="button">
                          إلغاء
                        </button>
                        <button
                          className="small"
                          onClick={() => handleSaveEdit(area.id)}
                          disabled={savingEdit}
                          type="button"
                        >
                          {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="life-area-card-header">
                        <h3>{area.name}</h3>
                        <div className="row-actions">
                          <button
                            className="icon-btn small"
                            onClick={() => startEdit(area)}
                            aria-label="تعديل المجال"
                            type="button"
                            title="تعديل"
                          >
                            <DynamicIcon name="pencil" size={14} />
                          </button>
                          <button
                            className="danger small"
                            onClick={() => handleDelete(area)}
                            type="button"
                          >
                            حذف
                          </button>
                        </div>
                      </div>

                      <div className="life-area-stats-row">
                        <span className="life-area-stat">
                          {area.stats.totalLists} مهمة رئيسية
                        </span>
                        <span className="life-area-stat life-area-stat-success">
                          {area.stats.completedLists} مكتملة
                        </span>
                        <span className="life-area-stat">
                          {area.stats.doneItems}/{area.stats.totalItems} مهمة فرعية
                        </span>
                      </div>

                      <div className="list-progress-row">
                        <div className="list-progress">
                          <div
                            className="list-progress-fill"
                            style={{ width: `${area.stats.completionRate}%`, background: area.color }}
                          />
                        </div>
                        <span className="list-progress-label">{area.stats.completionRate}٪</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteArea && (
        <ConfirmModal
          title="حذف مجال الحياة؟"
          description={
            <>
              هيتم حذف مجال "<strong>{confirmDeleteArea.name}</strong>" نهائيًا. مهامه ({confirmDeleteArea.stats.totalLists})
              مش هتتحذف، بس هترجع "بدون مجال".
            </>
          }
          confirmLabel="حذف المجال"
          onCancel={() => setConfirmDeleteArea(null)}
          onConfirm={confirmDeleteNow}
        />
      )}
    </div>
  );
}

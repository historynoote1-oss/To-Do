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
import { LifeAreaData, LIFE_AREA_COLORS, LIFE_AREA_ICON_PRESETS, DEFAULT_LIFE_AREA_COLOR, hexToSoftBg } from '../lib/lifeArea';
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

export default function LifeAreasManager({ onBack, onChange }: { onBack: () => void; onChange?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<LifeAreaData[]>([]);
  const [createForm, setCreateForm] = useState<AreaFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

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

  async function handleCreate() {
    const name = createForm.name.trim();
    if (!name) {
      toast.error('لازم تكتب اسم للمجال الأول');
      return;
    }
    setCreating(true);
    try {
      const area = await createLifeArea({ name, color: createForm.color, icon: createForm.icon || null });
      setAreas((prev) => [...prev, area]);
      setCreateForm(EMPTY_FORM);
      sounds.addItem();
      toast.success(`اتضاف مجال "${name}" 🎉`);
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
    if (!ALLOWED_ICON_IMAGE_TYPES.includes(file.type)) {
      toast.error('نوع الصورة لازم يكون JPG أو PNG أو WEBP أو GIF');
      return;
    }
    if (file.size > MAX_ICON_IMAGE_BYTES) {
      toast.error('حجم الصورة أكبر من الحد المسموح (2 ميجابايت)');
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
        <span className="life-area-intro-icon" aria-hidden="true">🧭</span>
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
        <h2>➕ مجال جديد</h2>
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
          <div className="life-area-color-grid">
            {LIFE_AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`life-area-color-swatch ${createForm.color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setCreateForm((f) => ({ ...f, color: c }))}
                aria-label={`اختيار اللون ${c}`}
              />
            ))}
            <label className="life-area-color-custom" title="لون مخصص">
              <input
                type="color"
                value={createForm.color}
                onChange={(e) => setCreateForm((f) => ({ ...f, color: e.target.value }))}
              />
            </label>
          </div>
        </div>
        <div className="settings-field">
          <label>الأيقونة (إيموجي)</label>
          <div className="life-area-icon-grid">
            {LIFE_AREA_ICON_PRESETS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={`life-area-icon-choice ${createForm.icon === icon ? 'selected' : ''}`}
                onClick={() => setCreateForm((f) => ({ ...f, icon }))}
                aria-label={`اختيار الأيقونة ${icon}`}
              >
                {icon}
              </button>
            ))}
            <input
              className="life-area-icon-custom-input"
              value={createForm.icon}
              onChange={(e) => setCreateForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder="أو اكتب إيموجي"
              maxLength={4}
            />
          </div>
          <p className="modal-hint">تقدر ترفع صورة مخصصة كأيقونة بعد إنشاء المجال.</p>
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
          <span className="empty-icon">🧭</span>
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

                <div className="life-area-card-glyph" style={{ background: hexToSoftBg(area.color), color: area.color }}>
                  {area.imageUrl ? (
                    <img src={resolveLifeAreaImageUrl(area.imageUrl) ?? undefined} alt="" />
                  ) : (
                    <span aria-hidden="true">{area.icon || '🏷️'}</span>
                  )}
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
                      <div className="life-area-color-grid">
                        {LIFE_AREA_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`life-area-color-swatch ${editForm.color === c ? 'selected' : ''}`}
                            style={{ background: c }}
                            onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                            aria-label={`اختيار اللون ${c}`}
                          />
                        ))}
                        <label className="life-area-color-custom" title="لون مخصص">
                          <input
                            type="color"
                            value={editForm.color}
                            onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="life-area-icon-grid">
                        {LIFE_AREA_ICON_PRESETS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className={`life-area-icon-choice ${editForm.icon === icon ? 'selected' : ''}`}
                            onClick={() => setEditForm((f) => ({ ...f, icon }))}
                          >
                            {icon}
                          </button>
                        ))}
                        <input
                          className="life-area-icon-custom-input"
                          value={editForm.icon}
                          onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                          placeholder="إيموجي"
                          maxLength={4}
                        />
                      </div>
                      <div className="life-area-image-actions">
                        <button
                          type="button"
                          className="small"
                          onClick={() => handlePickImage(area.id)}
                          disabled={isUploading}
                        >
                          🖼️ {area.imageUrl ? 'تغيير الصورة' : 'رفع صورة مخصصة'}
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
                            ✎
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

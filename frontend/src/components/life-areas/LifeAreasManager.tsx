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
} from '@/lib/api/api';
import {
  LifeAreaData,
  LifeAreaNode,
  LIFE_AREA_COLOR_GROUPS,
  LIFE_AREA_ICON_GROUPS,
  DEFAULT_LIFE_AREA_COLOR,
  hexToGradient,
  buildLifeAreaTree,
  flattenLifeAreaTree,
  getLifeAreaDescendantIds,
} from '@/lib/core/lifeArea';
import { DynamicIcon } from '@/lib/core/icons';
import { toast } from '@/lib/core/toast';
import { sounds } from '@/lib/audio/sounds';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';

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
// وفي صف المجال في الشجرة. لو فيه صورة بتتعرض هي، ولو أيقونة بس بتتحط
// جوه دائرة بتدرج لوني متولّد من لون المجال.
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
export function ColorGroups({ value, onSelect }: { value: string; onSelect: (color: string) => void }) {
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

// ===== شبكة الأيقونات — بقت مقسّمة لأقسام (زي شبكة الألوان بالظبط) عشان
// تتعرض كـ"اقتراحات" مبوّبة حسب جانب الحياة بدل قائمة طويلة عشوائية.
// معرّفة برا الكومبوننت الرئيسي لنفس سبب ColorGroups. =====
export function IconGroups({ value, onSelect }: { value: string; onSelect: (icon: string) => void }) {
  return (
    <div className="life-area-icon-groups">
      {LIFE_AREA_ICON_GROUPS.map((group) => (
        <div key={group.label} className="life-area-icon-group">
          <span className="life-area-color-group-label">{group.label}</span>
          <div className="life-area-icon-grid">
            {group.icons.map((icon) => (
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
        </div>
      ))}
    </div>
  );
}

// ===== منتقي "مجال الأب" — قائمة مسطّحة من الشجرة بمسافة بادئة تعكس
// العمق، بتستثني المجال نفسه وكل أحفاده (منطقيًا مينفعش يبقى تابع
// لنفسه أو لفرع من فروعه). =====
function ParentPicker({
  areas,
  excludeId,
  value,
  onChange,
}: {
  areas: LifeAreaData[];
  excludeId?: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const blocked = excludeId ? getLifeAreaDescendantIds(areas, excludeId) : new Set<string>();
  if (excludeId) blocked.add(excludeId);
  const flatTree = flattenLifeAreaTree(buildLifeAreaTree(areas)).filter((n) => !blocked.has(n.id));

  return (
    <select
      className="life-area-parent-select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">— مجال جذري (بدون أب) —</option>
      {flatTree.map((n) => (
        <option key={n.id} value={n.id}>
          {'—'.repeat(n.depth)} {n.depth > 0 ? ' ' : ''}
          {n.name}
        </option>
      ))}
    </select>
  );
}

export default function LifeAreasManager({
  onBack,
  onChange,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onChange?: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<LifeAreaData[]>([]);
  const [createForm, setCreateForm] = useState<AreaFormState>(EMPTY_FORM);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
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
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // ===== إنشاء مجال فرعي مباشرة تحت مجال معيّن — بيتفعّل من زر "+ فرعي"
  // على أي صف في الشجرة، وبيفتح نفس شكل النموذج بس بمقاس أصغر. =====
  const [subCreateParentId, setSubCreateParentId] = useState<string | null>(null);
  const [subCreateForm, setSubCreateForm] = useState<AreaFormState>(EMPTY_FORM);
  const [subCreating, setSubCreating] = useState(false);

  // العقد اللي متوسّعة حاليًا (بتعرض أطفالها) — الافتراضي: كل حاجة متوسّعة
  // أول ما تتحمّل البيانات (شوف useEffect تحت).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      setExpanded(new Set(data.map((a) => a.id))); // الكل متوسّع افتراضيًا
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل مجالات الحياة');
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    onChange?.();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      let area = await createLifeArea({
        name,
        color: createForm.color,
        icon: createForm.icon || null,
        parentId: createParentId,
      });
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
      setExpanded((prev) => new Set(prev).add(area.id));
      if (area.parentId) setExpanded((prev) => new Set(prev).add(area.parentId as string));
      setCreateForm(EMPTY_FORM);
      setCreateParentId(null);
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

  function openSubCreate(parentId: string) {
    setSubCreateParentId((prev) => (prev === parentId ? null : parentId));
    setSubCreateForm(EMPTY_FORM);
  }

  async function handleSubCreate(parentId: string) {
    const name = subCreateForm.name.trim();
    if (!name) {
      toast.error('لازم تكتب اسم للمجال الفرعي');
      return;
    }
    setSubCreating(true);
    try {
      const area = await createLifeArea({
        name,
        color: subCreateForm.color,
        icon: subCreateForm.icon || null,
        parentId,
      });
      setAreas((prev) => [...prev, area]);
      setExpanded((prev) => new Set(prev).add(parentId).add(area.id));
      setSubCreateParentId(null);
      setSubCreateForm(EMPTY_FORM);
      sounds.addItem();
      toast.success(`اتضاف مجال فرعي "${name}"`);
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء المجال الفرعي');
    } finally {
      setSubCreating(false);
    }
  }

  function startEdit(area: LifeAreaData) {
    setEditingId(area.id);
    setEditForm({ name: area.name, color: area.color, icon: area.icon || '' });
    setEditParentId(area.parentId);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
    setEditParentId(null);
  }

  async function handleSaveEdit(id: string) {
    const name = editForm.name.trim();
    if (!name) {
      toast.error('اسم المجال مينفعش يبقى فاضي');
      return;
    }
    setSavingEdit(true);
    try {
      const current = areas.find((a) => a.id === id);
      const parentChanged = current && current.parentId !== editParentId;
      const updated = await updateLifeArea(id, {
        name,
        color: editForm.color,
        icon: editForm.icon || null,
        ...(parentChanged ? { parentId: editParentId } : {}),
      });
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      if (parentChanged) {
        // نقل مجال لمكان جديد في الشجرة بيغيّر إحصائيات كل الآباء
        // (القديم والجديد) المجمّعة، فأسهل حاجة إننا نعيد التحميل بالكامل
        // عشان الأرقام تفضل صحيحة 100% من غير ما نحسبها يدويًا في المتصفح.
        await load();
        if (editParentId) setExpanded((prev) => new Set(prev).add(editParentId as string));
      }
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
    sounds.deleteItem();
    try {
      await deleteLifeArea(area.id);
      // الحذف ممكن يرجّع مجالاته الفرعية "جذرية" — أسهل وأضمن حاجة نعيد
      // تحميل القائمة كاملة بدل ما نحاول نعدّل الشجرة يدويًا في المتصفح.
      await load();
      toast.info(`اتحذف مجال "${area.name}" — مهامه رجعت "عام"${area.childCount ? '، وفروعه بقت مستقلة' : ''}`);
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المجال');
    }
  }

  // بيرجع كل إخوة مجال معيّن (نفس parentId) بترتيبهم الحالي — بيُستخدم
  // في النقل لأعلى/لأسفل عشان الترتيب يبقى *داخل نفس المستوى بس*.
  function siblingsOf(parentId: string | null): LifeAreaData[] {
    return areas.filter((a) => (a.parentId ?? null) === parentId).sort((a, b) => a.position - b.position);
  }

  async function move(id: string, direction: -1 | 1) {
    const area = areas.find((a) => a.id === id);
    if (!area) return;
    const parentId = area.parentId ?? null;
    const siblings = siblingsOf(parentId);
    const index = siblings.findIndex((a) => a.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;

    const nextSiblings = [...siblings];
    [nextSiblings[index], nextSiblings[target]] = [nextSiblings[target], nextSiblings[index]];
    const orderedIds = nextSiblings.map((a) => a.id);

    setAreas((prev) => {
      const positionOf = new Map(orderedIds.map((sid, i) => [sid, i]));
      return prev.map((a) => (positionOf.has(a.id) ? { ...a, position: positionOf.get(a.id)! } : a));
    });
    setReordering(true);
    sounds.hover();
    try {
      await reorderLifeAreas(orderedIds, parentId);
    } catch (err) {
      await load();
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
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
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
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      notifyChanged();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الصورة');
    } finally {
      setUploadingId(null);
    }
  }

  const tree = buildLifeAreaTree(areas);

  // ===== بترندر صف مجال واحد + أطفاله (استدعاء ذاتي) — دالة عادية بترجع
  // JSX (مش كومبوننت منفصل بيتنادى كـ <X/>)، فمفيش خطر إعادة mount عند كل
  // render لأنها مش بتتعامل معاها React كـ"نوع" عنصر جديد كل مرة. =====
  function renderNode(node: LifeAreaNode): JSX.Element {
    const isEditing = editingId === node.id;
    const isUploading = uploadingId === node.id;
    const siblings = siblingsOf(node.parentId ?? null);
    const indexInSiblings = siblings.findIndex((a) => a.id === node.id);
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSubCreateOpen = subCreateParentId === node.id;

    return (
      <div key={node.id} className="life-area-node-wrap" style={{ ['--depth' as any]: node.depth }}>
        <div className={`life-area-node ${node.depth > 0 ? 'is-nested' : ''}`} style={{ ['--card-accent' as any]: node.color }}>
          <button
            type="button"
            className={`life-area-node-expand ${hasChildren ? '' : 'is-leaf'}`}
            onClick={() => hasChildren && toggleExpand(node.id)}
            disabled={!hasChildren}
            aria-label={hasChildren ? (isExpanded ? 'طي الفروع' : 'توسيع الفروع') : undefined}
            aria-expanded={hasChildren ? isExpanded : undefined}
            title={hasChildren ? `${node.childCount} مجال فرعي` : undefined}
          >
            {hasChildren ? (
              <DynamicIcon name="chevron-down" size={14} className={isExpanded ? '' : 'is-collapsed'} />
            ) : (
              <span className="life-area-node-leaf-dot" aria-hidden="true" />
            )}
          </button>

          <div className="life-area-node-reorder">
            <button
              type="button"
              className="icon-btn small"
              onClick={() => move(node.id, -1)}
              disabled={indexInSiblings <= 0 || reordering}
              aria-label="نقل لأعلى"
              title="نقل لأعلى"
            >
              <DynamicIcon name="chevron-up" size={14} />
            </button>
            <button
              type="button"
              className="icon-btn small"
              onClick={() => move(node.id, 1)}
              disabled={indexInSiblings === siblings.length - 1 || reordering}
              aria-label="نقل لأسفل"
              title="نقل لأسفل"
            >
              <DynamicIcon name="chevron-down" size={14} />
            </button>
          </div>

          <div className="life-area-node-glyph-wrap">
            <AreaAvatar
              color={node.color}
              icon={node.icon}
              imageUrl={resolveLifeAreaImageUrl(node.imageUrl)}
              size={node.depth > 0 ? 36 : 44}
              iconSize={node.depth > 0 ? 17 : 20}
            />
            {isUploading && <span className="avatar-upload-spinner" aria-hidden="true" />}
          </div>

          <div className="life-area-node-body">
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
                <IconGroups value={editForm.icon} onSelect={(icon) => setEditForm((f) => ({ ...f, icon }))} />
                <label className="life-area-edit-subtitle">مكان المجال في الهيكل الهرمي</label>
                <ParentPicker areas={areas} excludeId={node.id} value={editParentId} onChange={setEditParentId} />
                <div className="life-area-image-actions">
                  <button type="button" className="small" onClick={() => handlePickImage(node.id)} disabled={isUploading}>
                    <DynamicIcon name="camera" size={14} /> {node.imageUrl ? 'تغيير الصورة' : 'رفع صورة مخصصة'}
                  </button>
                  {node.imageUrl && (
                    <button type="button" className="small danger" onClick={() => handleRemoveImage(node.id)} disabled={isUploading}>
                      حذف الصورة
                    </button>
                  )}
                  <input
                    ref={(el) => (fileInputRefs.current[node.id] = el)}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(e) => handleImageSelected(node.id, e.target.files?.[0])}
                  />
                </div>
                <div className="modal-actions">
                  <button className="small" onClick={cancelEdit} type="button">
                    إلغاء
                  </button>
                  <button className="small" onClick={() => handleSaveEdit(node.id)} disabled={savingEdit} type="button">
                    {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="life-area-node-header">
                  <h3>
                    {node.name}
                    {hasChildren && <span className="life-area-node-child-count">{node.childCount}</span>}
                  </h3>
                  <div className="row-actions">
                    <button
                      className="icon-btn small"
                      onClick={() => openSubCreate(node.id)}
                      aria-label="إضافة مجال فرعي"
                      type="button"
                      title="إضافة مجال فرعي"
                    >
                      <DynamicIcon name="plus" size={14} />
                    </button>
                    <button className="icon-btn small" onClick={() => startEdit(node)} aria-label="تعديل المجال" type="button" title="تعديل">
                      <DynamicIcon name="pencil" size={14} />
                    </button>
                    <button className="danger small" onClick={() => handleDelete(node)} type="button">
                      حذف
                    </button>
                  </div>
                </div>

                <div className="life-area-stats-row">
                  <span className="life-area-stat">{node.stats.totalLists} مهمة رئيسية</span>
                  <span className="life-area-stat life-area-stat-success">{node.stats.completedLists} مكتملة</span>
                  <span className="life-area-stat">
                    {node.stats.doneItems}/{node.stats.totalItems} مهمة فرعية
                  </span>
                  {hasChildren && (
                    <span className="life-area-stat life-area-stat-aggregate" title="شامل كل المجالات الفرعية">
                      <DynamicIcon name="folder-open" size={11} /> {node.aggregatedStats.totalLists} إجمالاً مع الفروع
                    </span>
                  )}
                </div>

                <div className="list-progress-row">
                  <div className="list-progress">
                    <div
                      className="list-progress-fill"
                      style={{ width: `${node.stats.completionRate}%`, background: node.color }}
                    />
                  </div>
                  <span className="list-progress-label">{node.stats.completionRate}٪</span>
                </div>
              </>
            )}
          </div>
        </div>

        {isSubCreateOpen && (
          <div className="life-area-subcreate-row" style={{ ['--depth' as any]: node.depth + 1 }}>
            <AreaAvatar color={subCreateForm.color} icon={subCreateForm.icon || 'tag'} size={32} iconSize={15} />
            <div className="life-area-subcreate-fields">
              <input
                value={subCreateForm.name}
                onChange={(e) => setSubCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`مجال فرعي تحت "${node.name}"`}
                maxLength={40}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSubCreate(node.id)}
              />
              <details className="life-area-subcreate-style">
                <summary>اللون والأيقونة</summary>
                <ColorGroups value={subCreateForm.color} onSelect={(color) => setSubCreateForm((f) => ({ ...f, color }))} />
                <IconGroups value={subCreateForm.icon} onSelect={(icon) => setSubCreateForm((f) => ({ ...f, icon }))} />
              </details>
            </div>
            <div className="modal-actions">
              <button className="small" onClick={() => setSubCreateParentId(null)} type="button">
                إلغاء
              </button>
              <button
                className="small"
                onClick={() => handleSubCreate(node.id)}
                disabled={subCreating || !subCreateForm.name.trim()}
                type="button"
              >
                {subCreating ? 'جاري الإنشاء...' : 'إضافة'}
              </button>
            </div>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div className="life-area-node-children">{node.children.map((child) => renderNode(child))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>مجالات الحياة</strong>
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
        <DynamicIcon name="compass" size={28} className="life-area-intro-icon" />
        <div>
          <h1>مجالات الحياة</h1>
          <p>
            نظّم مهامك حسب جوانب حياتك المختلفة — صحة، شغل، عائلة، تعلّم، وأي حاجة تانية تهمك. أنشئ عدد غير محدود من
            المجالات، وقسّم كل مجال لمجالات فرعية (مثلاً "الصحة واللياقة" ← "الجيم"، "الجري"، "الأكل الصحي")، رتّبهم
            زي ما تحب، وتابع تقدمك في كل واحد منهم — وفي كل الفرع مع بعضه — على حدة.
          </p>
        </div>
      </div>

      {/* ===== نموذج إنشاء مجال جديد ===== */}
      <div className="admin-panel profile-section life-area-create-panel">
        <h2>
          <DynamicIcon name="plus" size={18} /> مجال جديد
        </h2>

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
              <label>
                مكان المجال <span className="modal-hint">(اختياري: اجعله فرعيًا تحت مجال موجود)</span>
              </label>
              <ParentPicker areas={areas} value={createParentId} onChange={setCreateParentId} />
            </div>
            <div className="settings-field">
              <label>اللون</label>
              <ColorGroups value={createForm.color} onSelect={(color) => setCreateForm((f) => ({ ...f, color }))} />
            </div>
            <div className="settings-field">
              <label>الأيقونة {createImagePreview && <span className="modal-hint">(هتتستخدم الصورة اللي اخترتها بدلها)</span>}</label>
              <IconGroups value={createForm.icon} onSelect={(icon) => setCreateForm((f) => ({ ...f, icon }))} />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={handleCreate} disabled={creating || !createForm.name.trim()} type="button">
            {creating ? 'جاري الإنشاء...' : createParentId ? 'إنشاء المجال الفرعي' : 'إنشاء المجال'}
          </button>
        </div>
      </div>

      {/* ===== شجرة المجالات الحالية ===== */}
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

      {!loading && areas.length > 0 && <div className="life-area-tree">{tree.map((node) => renderNode(node))}</div>}

      {confirmDeleteArea && (
        <ConfirmModal
          title="حذف مجال الحياة؟"
          description={
            <>
              هيتم حذف مجال "<strong>{confirmDeleteArea.name}</strong>" نهائيًا. مهامه ({confirmDeleteArea.stats.totalLists})
              مش هتتحذف، بس هترجع "عام".
              {confirmDeleteArea.childCount > 0 && (
                <>
                  {' '}
                  ومجالاته الفرعية ({confirmDeleteArea.childCount}) هترجع مجالات جذرية مستقلة، مش هتتحذف معاه.
                </>
              )}
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

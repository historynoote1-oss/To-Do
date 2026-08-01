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
} from '@/services/api';
import {
  LifeAreaData,
  LifeAreaNode,
  DEFAULT_LIFE_AREA_COLOR,
  buildLifeAreaTree,
  flattenLifeAreaTree,
  getLifeAreaDescendantIds,
} from '@/utils/lifeArea';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';
import { ColorPicker } from '@/components/common/ColorPicker';
import { AreaAvatar, IconGroups } from '@/pages/life-areas/LifeAreaShared';
import LifeAreaWizard from '@/pages/life-areas/LifeAreaWizard';

const ALLOWED_ICON_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ICON_IMAGE_BYTES = 2 * 1024 * 1024;

interface AreaFormState {
  name: string;
  color: string;
  icon: string;
}

const EMPTY_FORM: AreaFormState = { name: '', color: DEFAULT_LIFE_AREA_COLOR, icon: '' };

// ملحوظة: AreaAvatar وIconGroups اتنقلوا لملف مشترك (LifeAreaShared.tsx)
// عشان يقدر يستخدمهم ويزارد الإنشاء خطوة-بخطوة (LifeAreaWizard.tsx) من
// غير استيراد دائري مع الملف ده — بيتصدّروا هنا تاني (re-export) عشان أي
// كود قديم بيستوردهم من هنا (زي QuickCreateLifeArea.tsx) يفضل شغال من
// غير تعديل.
export { AreaAvatar, IconGroups };

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

  // ===== إنشاء مجال حياة رئيسي جديد =====
  // النموذج الطويل القديم (اسم + مكان + لون + أيقونة + صورة كلهم في نفس
  // الشاشة) اتشال بالكامل — دلوقتي بس زرار صغير بيفتح ويزارد خطوة-بخطوة
  // (LifeAreaWizard.tsx): اسم → مجالات فرعية → لون/أيقونة مع معاينة حية →
  // مراجعة وإنشاء. باقي الصفحة بقت مساحة كاملة لعرض كروت المجالات.
  const [wizardOpen, setWizardOpen] = useState(false);

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

  // ===== الكارت بقى مضغوط بالتصميم الجديد (أيقونة + اسم + سهم بس) —
  // الإحصائيات وشريط التقدم بقوا "تفاصيل" اختيارية بتتفتح بالضغط على اسم
  // المجال، بدل ما تتفرض على العين طول الوقت (Progressive disclosure). =====
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());

  // ===== سحب وإفلات (Drag & Drop) لإعادة الترتيب — إضافة فوق أزرار
  // الأعلى/الأسفل الموجودة أصلاً (بتفضل شغالة كـ fallback يسهل الوصول
  // له بدون فأرة/لمس دقيق). السحب مسموح بس بين إخوة على نفس المستوى. =====
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const fetchedAreas = await getLifeAreas();
      setAreas(fetchedAreas);
      setExpanded(new Set(fetchedAreas.map((area) => area.id))); // الكل متوسّع افتراضيًا
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

  // بينادى بعد ما الويزارد (LifeAreaWizard) يخلّص إنشاء المجال الرئيسي +
  // كل فروعه بنجاح — بيحدّث القائمة المحلية على طول (من غير إعادة تحميل
  // كاملة)، بيوسّع المجال الجديد وأبوه تلقائيًا عشان يبانوا في الشجرة/الكارت
  // على طول، ويبلّغ الشاشة الأب (App) إن فيه تغيير.
  function handleWizardCreated(main: LifeAreaData, subs: LifeAreaData[]) {
    setAreas((prev) => [...prev, main, ...subs]);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(main.id);
      for (const s of subs) next.add(s.id);
      return next;
    });
    notifyChanged();
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
    await reorderTo(parentId, nextSiblings.map((a) => a.id));
  }

  function toggleDetails(id: string) {
    setDetailsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reorderTo(parentId: string | null, orderedIds: string[]) {
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

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {
      /* بعض المتصفحات بتشتكي لو الداتا فاضية — مش مؤثر على السحب نفسه */
    }
  }

  function handleDragOver(e: React.DragEvent, node: LifeAreaNode) {
    if (!dragId || dragId === node.id) return;
    const dragged = areas.find((a) => a.id === dragId);
    // السحب مسموح بس بين إخوة (نفس الأب) — نقل مجال لمستوى تاني عن طريق
    // السحب مش مدعوم دلوقتي، بيتم عن طريق "مكان المجال" في نموذج التعديل.
    if (!dragged || (dragged.parentId ?? null) !== (node.parentId ?? null)) return;
    e.preventDefault();
    setDragOverId(node.id);
  }

  async function handleDrop(e: React.DragEvent, node: LifeAreaNode) {
    e.preventDefault();
    const id = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!id || id === node.id) return;
    const dragged = areas.find((a) => a.id === id);
    if (!dragged) return;
    const parentId = dragged.parentId ?? null;
    if (parentId !== (node.parentId ?? null)) return;
    const siblings = siblingsOf(parentId);
    const fromIndex = siblings.findIndex((a) => a.id === id);
    const toIndex = siblings.findIndex((a) => a.id === node.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...siblings];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await reorderTo(parentId, next.map((a) => a.id));
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
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
    const isDetailsOpen = detailsOpen.has(node.id);
    const isDragging = dragId === node.id;
    const isDragOver = dragOverId === node.id;

    return (
      <div key={node.id} className="life-area-node-wrap" style={{ ['--depth' as any]: node.depth }}>
        <div
          className={`life-area-node ${node.depth > 0 ? 'is-nested' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'is-drag-over' : ''}`}
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={handleDragEnd}
        >
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

          <div className="life-area-node-glyph-wrap">
            <AreaAvatar
              color={node.color}
              icon={node.icon}
              imageUrl={resolveLifeAreaImageUrl(node.imageUrl)}
              size={node.depth > 0 ? 34 : 40}
              iconSize={node.depth > 0 ? 16 : 18}
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
                <ColorPicker value={editForm.color} onChange={(color) => setEditForm((f) => ({ ...f, color }))} />
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
                {/* ===== الصف المضغوط الافتراضي: أيقونة (فوق) + اسم بس. الضغط
                    على الاسم بيفتح/يقفل لوحة التفاصيل (إحصائيات + تقدّم +
                    ترتيب) تحت الكارت — إفصاح تدريجي (progressive disclosure)
                    بدل ما نفرض كل الأرقام على العين طول الوقت. ===== */}
                <div className="life-area-node-header">
                  <button
                    type="button"
                    className="life-area-node-name-btn"
                    onClick={() => toggleDetails(node.id)}
                    aria-expanded={isDetailsOpen}
                    title={isDetailsOpen ? 'إخفاء التفاصيل' : 'عرض التفاصيل والتقدّم'}
                  >
                    <h3>
                      {node.name}
                      {hasChildren && <span className="life-area-node-child-count">{node.childCount}</span>}
                    </h3>
                  </button>
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
                    <button
                      className="icon-btn small danger"
                      onClick={() => handleDelete(node)}
                      aria-label="حذف المجال"
                      type="button"
                      title="حذف"
                    >
                      <DynamicIcon name="trash-2" size={14} />
                    </button>
                  </div>
                </div>

                {isDetailsOpen && (
                  <div className="life-area-details-panel">
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

                    <div className="life-area-node-reorder">
                      <span className="modal-hint">الترتيب: اسحب الكارت لمكانه، أو</span>
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
                  </div>
                )}
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
                <ColorPicker value={subCreateForm.color} onChange={(color) => setSubCreateForm((f) => ({ ...f, color }))} />
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

      {/* ===== زرار صغير بس لإنشاء مجال جديد — بيفتح الويزارد خطوة-بخطوة.
          باقي الصفحة بقت مخصصة بالكامل لعرض كروت مجالات الحياة. ===== */}
      <div className="life-area-toolbar">
        <button type="button" className="life-area-new-btn" onClick={() => setWizardOpen(true)}>
          <DynamicIcon name="plus" size={16} /> مجال حياة جديد
        </button>
      </div>

      {/* ===== كروت مجالات الحياة ===== */}
      {loading && (
        <div className="life-area-cards-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {!loading && areas.length === 0 && (
        <p className="empty">
          <DynamicIcon name="compass" size={32} className="empty-icon" />
          لسه مفيش مجالات حياة، ابدأ بإنشاء أول مجال من الزرار فوق
        </p>
      )}

      {!loading && areas.length > 0 && (
        <div className="life-area-cards-grid">
          {tree.map((node) => (
            <div key={node.id} className="life-area-card" style={{ ['--area-color' as any]: node.color }}>
              {renderNode(node)}
            </div>
          ))}
        </div>
      )}

      <LifeAreaWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={handleWizardCreated} />

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

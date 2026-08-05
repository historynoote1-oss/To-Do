import { useEffect, useState } from 'react';
import { getLifeAreas, deleteLifeArea, resolveLifeAreaImageUrl } from '@/services/api';
import { LifeAreaData, LifeAreaNode, buildLifeAreaTree } from '@/utils/lifeArea';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';
import { AreaAvatar, IconGroups } from '@/pages/life-areas/LifeAreaShared';
import LifeAreaWizard from '@/pages/life-areas/LifeAreaWizard';
import LifeAreaDetailsModal from '@/pages/life-areas/LifeAreaDetailsModal';

// ملحوظة: AreaAvatar وIconGroups اتنقلوا لملف مشترك (LifeAreaShared.tsx)
// عشان يقدر يستخدمهم ويزارد الإنشاء/التعديل (LifeAreaWizard.tsx) من غير
// استيراد دائري مع الملف ده — بيتصدّروا هنا تاني (re-export) عشان أي كود
// قديم بيستوردهم من هنا (زي QuickCreateLifeArea.tsx) يفضل شغال من غير تعديل.
export { AreaAvatar, IconGroups };

// ===== الصفحة دلوقتي مبنية بالكامل حوالين فكرة "كارت لكل مجال حياة
// رئيسي": كل تعديل (اسم/فروع/ترتيب الفروع/شكل ولون) بيتم *حصريًا* من
// خلال الويزارد (زر القلم على الكارت)، ومفيش أي تحكم متفرّق على الكارت
// نفسه غير: فتح تفاصيل (بالضغط على أي اسم)، تعديل، وحذف. ده بيخلي تجربة
// الاستخدام متسقة وسهلة التوقّع بدل ما يبقى فيه أكتر من مكان للتعديل. =====
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

  // فتح/غلق الويزارد. editingArea = null يعني وضع إنشاء، وغير null يعني
  // وضع تعديل معبّى بالمجال الرئيسي + فروعه المباشرة الحاليين.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<{ main: LifeAreaData; subs: LifeAreaData[] } | null>(null);

  const [confirmDeleteArea, setConfirmDeleteArea] = useState<LifeAreaData | null>(null);

  // لوحة التفاصيل (إحصائيات + تقدّم) بتتفتح بالضغط على اسم أي مجال، رئيسي
  // كان أو فرعي — محتفظين كمان باسم الأب (لو فرعي) عشان نعرضه في اللوحة.
  const [detailsFor, setDetailsFor] = useState<{ node: LifeAreaNode; parentName: string | null } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const fetchedAreas = await getLifeAreas();
      setAreas(fetchedAreas);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل مجالات الحياة');
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    onChange?.();
  }

  function openCreateWizard() {
    setEditingArea(null);
    setWizardOpen(true);
  }

  function openEditWizard(node: LifeAreaNode) {
    setEditingArea({ main: node, subs: node.children.map(({ children, depth, ...rest }) => rest) });
    setWizardOpen(true);
  }

  // بينادى بعد ما الويزارد يخلّص إنشاء مجال رئيسي جديد + كل فروعه بنجاح —
  // بيحدّث القائمة المحلية على طول (من غير إعادة تحميل كاملة).
  function handleWizardCreated(main: LifeAreaData, subs: LifeAreaData[]) {
    setAreas((prev) => [...prev, main, ...subs]);
    notifyChanged();
  }

  // بينادى بعد ما تعديل مجال موجود يتحفظ — main هو النسخة المحدّثة،
  // وsubs هي القائمة *النهائية* الكاملة لفروعه بعد أي إضافة/حذف/ترتيب.
  function handleWizardSaved(main: LifeAreaData, subs: LifeAreaData[]) {
    const originalSubIds = new Set((editingArea?.subs ?? []).map((s) => s.id));
    setAreas((prev) => {
      const withoutOld = prev.filter((a) => a.id !== main.id && !originalSubIds.has(a.id));
      return [...withoutOld, main, ...subs];
    });
    setEditingArea(null);
    notifyChanged();
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

  function openDetails(node: LifeAreaNode, parentName: string | null) {
    setDetailsFor({ node, parentName });
    sounds.hover();
  }

  const tree = buildLifeAreaTree(areas);

  // ===== صف مجال فرعي داخل الكارت — اسم بس (من غير أيقونة زي ما اتطلب)،
  // مع عدّاد صغير اختياري لو عنده مهام. بيدعم تعشيش أعمق (فرعي لفرعي) لو
  // وُجد فعليًا في البيانات، لكن الويزارد نفسه بينشئ مستوى واحد بس. =====
  function renderSubRow(node: LifeAreaNode, parentName: string): JSX.Element {
    return (
      <li key={node.id} className="life-area-card-sub">
        <button type="button" className="life-area-card-sub-btn" onClick={() => openDetails(node, parentName)}>
          <span className="life-area-card-sub-dot" style={{ background: node.color }} aria-hidden="true" />
          <span className="life-area-card-sub-name">{node.name}</span>
          {node.stats.totalLists > 0 && <span className="life-area-card-sub-count">{node.stats.totalLists}</span>}
        </button>
        {node.children.length > 0 && (
          <ul className="life-area-card-subs is-nested">
            {node.children.map((child) => renderSubRow(child, node.name))}
          </ul>
        )}
      </li>
    );
  }

  function renderCard(node: LifeAreaNode): JSX.Element {
    return (
      <div key={node.id} className="life-area-card" style={{ ['--area-color' as any]: node.color }}>
        <div className="life-area-card-toolbar">
          <button
            type="button"
            className="icon-btn small"
            onClick={() => openEditWizard(node)}
            aria-label={`تعديل مجال ${node.name}`}
            title="تعديل"
          >
            <DynamicIcon name="pencil" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn small danger"
            onClick={() => handleDelete(node)}
            aria-label={`حذف مجال ${node.name}`}
            title="حذف"
          >
            <DynamicIcon name="trash-2" size={14} />
          </button>
        </div>

        <button type="button" className="life-area-card-main" onClick={() => openDetails(node, null)}>
          <AreaAvatar
            color={node.color}
            icon={node.icon}
            imageUrl={resolveLifeAreaImageUrl(node.imageUrl)}
            size={48}
            iconSize={22}
          />
          <span className="life-area-card-main-text">
            <strong>{node.name}</strong>
            <span className="life-area-card-main-meta">
              {node.stats.totalLists > 0
                ? `${node.stats.totalLists} قائمة · ${node.stats.completionRate}٪ مكتمل`
                : 'من غير مهام لسه'}
            </span>
          </span>
          <DynamicIcon name="chevron-left" size={16} className="life-area-card-chevron" />
        </button>

        {node.children.length > 0 && (
          <ul className="life-area-card-subs">{node.children.map((child) => renderSubRow(child, node.name))}</ul>
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
        <button type="button" className="life-area-new-btn" onClick={openCreateWizard}>
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

      {!loading && areas.length > 0 && <div className="life-area-cards-grid">{tree.map((node) => renderCard(node))}</div>}

      <LifeAreaWizard
        open={wizardOpen}
        editing={editingArea}
        onClose={() => setWizardOpen(false)}
        onCreated={handleWizardCreated}
        onSaved={handleWizardSaved}
      />

      <LifeAreaDetailsModal
        area={detailsFor?.node ?? null}
        parentName={detailsFor?.parentName}
        onClose={() => setDetailsFor(null)}
      />

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

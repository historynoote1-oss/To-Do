import { useEffect, useState } from 'react';
import {
  getDatabase,
  getDatabases,
  addProperty,
  deleteProperty,
  addRow,
  updateRow,
  deleteRow,
  convertRowToTask,
  unlinkRowTask,
  createView,
  updateView,
  deleteView,
  DatabaseDetail,
  DatabaseSummary,
  DatabaseProperty,
  DatabasePropertyType,
  DatabasePropertyOption,
  DatabaseViewType,
  DatabaseSavedView,
  DatabaseFilter,
  DatabaseSort,
  FilterOperator,
  RollupConfig,
  RollupAggregation,
  DatabaseRow as DatabaseRowType,
} from '@/services/api';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';
import { ColorPicker } from '@/components/common/ColorPicker';
import { DEFAULT_LIFE_AREA_COLOR } from '@/utils/lifeArea';

const PROPERTY_TYPE_LABELS: Record<DatabasePropertyType, string> = {
  text: 'نص',
  number: 'رقم',
  select: 'اختيار واحد',
  multiSelect: 'اختيار متعدد',
  date: 'تاريخ',
  checkbox: 'صح/خطأ',
  relation: 'ربط بقاعدة تانية',
  rollup: 'حساب تلقائي (Rollup)',
};

const PROPERTY_TYPE_ICONS: Record<DatabasePropertyType, string> = {
  text: 'text',
  number: 'hash',
  select: 'circle-dot',
  multiSelect: 'list-checks',
  date: 'calendar-days',
  checkbox: 'check-square',
  relation: 'link-2',
  rollup: 'sigma',
};

const ROLLUP_AGGREGATION_LABELS: Record<RollupAggregation, string> = {
  count: 'عدد الصفوف المرتبطة',
  sum: 'مجموع',
  average: 'متوسط',
  min: 'أقل قيمة',
  max: 'أكبر قيمة',
  showValues: 'عرض القيم',
};

const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'يحتوي على',
  equals: 'يساوي',
  notEquals: 'مايساويش',
  isEmpty: 'فاضي',
  isNotEmpty: 'مش فاضي',
  gt: 'أكبر من',
  gte: 'أكبر من أو يساوي',
  lt: 'أقل من',
  lte: 'أقل من أو يساوي',
  before: 'قبل',
  after: 'بعد',
};

// ===== المرحلة 5: لكل نوع خاصية، أي عمليات الفلترة المتاحة ليها =====
function operatorsForType(type: DatabasePropertyType): FilterOperator[] {
  switch (type) {
    case 'text':
      return ['contains', 'equals', 'notEquals', 'isEmpty', 'isNotEmpty'];
    case 'number':
    case 'rollup':
      return ['equals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'];
    case 'select':
      return ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'];
    case 'multiSelect':
    case 'relation':
      return ['contains', 'isEmpty', 'isNotEmpty'];
    case 'date':
      return ['before', 'after', 'equals', 'isEmpty', 'isNotEmpty'];
    case 'checkbox':
      return ['equals'];
    default:
      return ['isEmpty', 'isNotEmpty'];
  }
}

// ===== المرحلة 5: بتطبّق فلتر واحد على قيمة صف =====
function matchesFilter(value: unknown, filter: DatabaseFilter): boolean {
  const { operator } = filter;
  if (operator === 'isEmpty') {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  }
  if (operator === 'isNotEmpty') {
    return !(value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
  }
  const target = filter.value;
  switch (operator) {
    case 'contains':
      if (Array.isArray(value)) return value.some((v) => String(v) === String(target));
      return typeof value === 'string' && value.toLowerCase().includes(String(target ?? '').toLowerCase());
    case 'equals':
      if (typeof value === 'boolean') return value === Boolean(target);
      return String(value ?? '') === String(target ?? '');
    case 'notEquals':
      return String(value ?? '') !== String(target ?? '');
    case 'gt':
      return typeof value === 'number' && value > Number(target);
    case 'gte':
      return typeof value === 'number' && value >= Number(target);
    case 'lt':
      return typeof value === 'number' && value < Number(target);
    case 'lte':
      return typeof value === 'number' && value <= Number(target);
    case 'before':
      return typeof value === 'string' && new Date(value).getTime() < new Date(String(target)).getTime();
    case 'after':
      return typeof value === 'string' && new Date(value).getTime() > new Date(String(target)).getTime();
    default:
      return true;
  }
}

function applyFiltersAndSorts(rows: DatabaseRowType[], filters: DatabaseFilter[], sorts: DatabaseSort[]): DatabaseRowType[] {
  let result = rows;
  if (filters.length > 0) {
    result = result.filter((row) => filters.every((f) => matchesFilter(row.values[f.propertyId], f)));
  }
  if (sorts.length > 0) {
    result = [...result].sort((a, b) => {
      for (const sort of sorts) {
        const av = a.values[sort.propertyId];
        const bv = b.values[sort.propertyId];
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'ar');
        if (cmp !== 0) return sort.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }
  return result;
}

// ===== عرض جدول (Table View) لقاعدة بيانات واحدة — المرحلة 1 من ميزة
// الـ Databases. كل عمود هنا هو "خاصية" اتعرّفت من المستخدم (نص/رقم/
// اختيار/تاريخ/صح-خطأ)، وكل صف بيتعدّل مباشرة (inline) من غير أي شاشة
// تعديل منفصلة — زي بالظبط فلسفة جدول Notion. =====
export default function DatabaseView({
  databaseId,
  onBack,
  onOpenMenu,
  menuOpen,
  onOpenTask,
  onOpenDatabase,
}: {
  databaseId: string;
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onOpenTask?: () => void;
  onOpenDatabase?: (databaseId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<DatabaseDetail | null>(null);

  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [confirmDeleteProperty, setConfirmDeleteProperty] = useState<DatabaseProperty | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<string | null>(null);
  const [openSelectCell, setOpenSelectCell] = useState<{ rowId: string; propertyId: string } | null>(null);

  // ===== المرحلة 5: Views متعددة محفوظة — بدل viewType/boardGroupById
  // القديمين على مستوى القاعدة، دلوقتي فيه تبويبات views مسمّاة (جدول/
  // كانبان/تقويم)، كل واحد بإعداداته وفلاتره وترتيبه الخاص. =====
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [confirmDeleteView, setConfirmDeleteView] = useState<DatabaseSavedView | null>(null);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);

  // ===== المرحلة 2: عرض Board (كانبان) =====
  const [switchingView, setSwitchingView] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [openMoveMenuRowId, setOpenMoveMenuRowId] = useState<string | null>(null);
  const [convertingRowId, setConvertingRowId] = useState<string | null>(null);

  // ===== المرحلة 4: Relations — كاش لقواعد البيانات الهدف بتاعة كل خاصية
  // relation، عشان نعرض عنوان مفهوم لكل صف مرتبط (بدل الـ ID الخام) ونوفّر
  // قائمة الصفوف المتاحة للربط من غير ما نطلبها من السيرفر كل مرة. =====
  const [relatedDbs, setRelatedDbs] = useState<Record<string, DatabaseDetail>>({});
  const [loadingRelatedDbIds, setLoadingRelatedDbIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, [databaseId]);

  async function load() {
    setLoading(true);
    try {
      const fetched = await getDatabase(databaseId);
      setDb(fetched);
      setActiveViewId((prev) => {
        if (prev && fetched.views.some((v) => v.id === prev)) return prev;
        return fetched.views[0]?.id ?? null;
      });
      for (const property of fetched.properties) {
        if (property.type === 'relation' && property.relatedDatabaseId) {
          void ensureRelatedDbLoaded(property.relatedDatabaseId);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل القاعدة');
    } finally {
      setLoading(false);
    }
  }

  // ===== المرحلة 4: بيجيب قاعدة بيانات هدف (لو لسه مش في الكاش أو force=true)
  // ويحطها في relatedDbs عشان خلايا relation تعرض عناوين مفهومة وقائمة
  // اختيار جاهزة من غير ما تنتظر طلب لكل خانة =====
  async function ensureRelatedDbLoaded(id: string, force = false) {
    if (!force && (relatedDbs[id] || loadingRelatedDbIds[id])) return;
    setLoadingRelatedDbIds((prev) => ({ ...prev, [id]: true }));
    try {
      const fetched = await getDatabase(id);
      setRelatedDbs((prev) => ({ ...prev, [id]: fetched }));
    } catch {
      // فشل تحميل القاعدة الهدف — الخانة هتفضل تعرض حالة "تعذّر التحميل"
    } finally {
      setLoadingRelatedDbIds((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleAddRow() {
    if (!db) return;
    try {
      const row = await addRow(db.id, {});
      sounds.addItem();
      setDb((prev) => (prev ? { ...prev, rows: [...prev.rows, row] } : prev));
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إضافة صف');
    }
  }

  // تحديث خانة واحدة محليًا فورًا (تجربة استخدام سريعة)، وبعدين بيتبعت
  // التعديل للسيرفر في الخلفية — لو فشل، بيرجّع القيمة القديمة ويعرض خطأ.
  async function handleCellChange(rowId: string, propertyId: string, value: unknown) {
    if (!db) return;
    const previousRow = db.rows.find((r) => r.id === rowId);
    const previousValue = previousRow?.values[propertyId];
    setDb((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [propertyId]: value } } : r)),
          }
        : prev
    );
    try {
      await updateRow(db.id, rowId, { [propertyId]: value });
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ التعديل');
      setDb((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [propertyId]: previousValue } } : r)),
            }
          : prev
      );
    }
  }

  async function confirmDeleteRowNow() {
    const rowId = confirmDeleteRow;
    setConfirmDeleteRow(null);
    if (!db || !rowId) return;
    sounds.deleteItem();
    try {
      await deleteRow(db.id, rowId);
      setDb((prev) => (prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) } : prev));
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الصف');
    }
  }

  async function confirmDeletePropertyNow() {
    const property = confirmDeleteProperty;
    setConfirmDeleteProperty(null);
    if (!db || !property) return;
    sounds.deleteItem();
    try {
      await deleteProperty(db.id, property.id);
      setDb((prev) => (prev ? { ...prev, properties: prev.properties.filter((p) => p.id !== property.id) } : prev));
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الخاصية');
    }
  }

  function handlePropertyCreated(property: DatabaseProperty) {
    setDb((prev) => (prev ? { ...prev, properties: [...prev.properties, property] } : prev));
    setAddPropertyOpen(false);
    if (property.type === 'relation' && property.relatedDatabaseId) {
      void ensureRelatedDbLoaded(property.relatedDatabaseId);
    }
  }

  // ===== المرحلة 5: Views متعددة محفوظة =====
  function updateViewLocally(updated: DatabaseSavedView) {
    setDb((prev) => (prev ? { ...prev, views: prev.views.map((v) => (v.id === updated.id ? updated : v)) } : prev));
  }

  async function handleCreateView(name: string, type: DatabaseViewType) {
    if (!db) return;
    try {
      const created = await createView(db.id, { name, type });
      setDb((prev) => (prev ? { ...prev, views: [...prev.views, created] } : prev));
      setActiveViewId(created.id);
      setAddViewOpen(false);
      sounds.addItem();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء View');
    }
  }

  async function handleUpdateView(viewId: string, data: Parameters<typeof updateView>[2]) {
    if (!db) return;
    setSwitchingView(true);
    try {
      const updated = await updateView(db.id, viewId, data);
      updateViewLocally(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحديث الـ View');
    } finally {
      setSwitchingView(false);
    }
  }

  async function handleDeleteViewNow() {
    const view = confirmDeleteView;
    setConfirmDeleteView(null);
    if (!db || !view) return;
    try {
      await deleteView(db.id, view.id);
      setDb((prev) => {
        if (!prev) return prev;
        const remaining = prev.views.filter((v) => v.id !== view.id);
        return { ...prev, views: remaining };
      });
      setActiveViewId((prev) => {
        if (prev !== view.id) return prev;
        const remaining = db.views.filter((v) => v.id !== view.id);
        return remaining[0]?.id ?? null;
      });
      setViewSettingsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الـ View');
    }
  }

  // ===== اختيار الخاصية اللي هتتحول لأعمدة الكانبان (لازم تكون اختيار واحد) =====
  async function handleSetBoardGroupBy(propertyId: string) {
    if (!activeViewId) return;
    await handleUpdateView(activeViewId, { boardGroupById: propertyId });
  }

  // ===== اختيار خاصية التاريخ اللي عرض التقويم هيتبني عليها =====
  async function handleSetCalendarDateBy(propertyId: string) {
    if (!activeViewId) return;
    await handleUpdateView(activeViewId, { calendarDateById: propertyId });
  }

  // ===== نقل صف لعمود (خيار) تاني في الكانبان — بيغيّر قيمة خاصية التجميع =====
  async function handleMoveRowToColumn(rowId: string, groupPropertyId: string, columnValue: string | null) {
    setOpenMoveMenuRowId(null);
    await handleCellChange(rowId, groupPropertyId, columnValue);
  }

  // ===== إضافة صف جديد داخل عمود معيّن في الكانبان مباشرة بقيمته مضبوطة =====
  async function handleAddRowInColumn(groupPropertyId: string, columnValue: string | null) {
    if (!db) return;
    try {
      const row = await addRow(db.id, columnValue !== null ? { [groupPropertyId]: columnValue } : {});
      sounds.addItem();
      setDb((prev) => (prev ? { ...prev, rows: [...prev.rows, row] } : prev));
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إضافة صف');
    }
  }

  // ===== المرحلة 3: تحويل صف لمهمة فعلية، أو فك ربطه لاحقًا =====
  async function handleConvertToTask(rowId: string) {
    if (!db) return;
    setConvertingRowId(rowId);
    try {
      const updated = await convertRowToTask(db.id, rowId);
      sounds.addItem();
      setDb((prev) => (prev ? { ...prev, rows: prev.rows.map((r) => (r.id === rowId ? updated : r)) } : prev));
      toast.success(`اتعمل مهمة: "${updated.linkedTask?.title ?? ''}"`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر تحويل الصف لمهمة');
    } finally {
      setConvertingRowId(null);
    }
  }

  async function handleUnlinkTask(rowId: string) {
    if (!db) return;
    try {
      const updated = await unlinkRowTask(db.id, rowId);
      setDb((prev) => (prev ? { ...prev, rows: prev.rows.map((r) => (r.id === rowId ? updated : r)) } : prev));
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر فك الربط');
    }
  }

  if (loading) {
    return (
      <div className="container view-fade profile-page">
        <div className="skeleton skeleton-card" />
      </div>
    );
  }

  if (!db) {
    return (
      <div className="container view-fade profile-page">
        <p className="empty">القاعدة غير موجودة أو اتحذفت</p>
      </div>
    );
  }

  const activeView: DatabaseSavedView | null = db.views.find((v) => v.id === activeViewId) ?? db.views[0] ?? null;
  const visibleRows =
    activeView && activeView.type === 'table' ? applyFiltersAndSorts(db.rows, activeView.filters, activeView.sorts) : db.rows;

  return (
    <div className="container view-fade profile-page db-view-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>{db.name}</strong>
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

      {db.properties.length > 0 && activeView && (
        <>
          <div className="db-view-toggle" role="tablist" aria-label="الـ Views المحفوظة">
            {db.views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={activeView.id === v.id}
                className={`db-view-toggle-btn ${activeView.id === v.id ? 'is-active' : ''}`}
                onClick={() => setActiveViewId(v.id)}
                disabled={switchingView}
              >
                <DynamicIcon name={v.type === 'board' ? 'columns-3' : v.type === 'calendar' ? 'calendar-range' : 'table'} size={14} />
                {v.name}
              </button>
            ))}
            <button type="button" className="db-view-toggle-btn db-view-toggle-add" onClick={() => setAddViewOpen(true)} title="View جديد">
              <DynamicIcon name="plus" size={14} />
            </button>
            <button
              type="button"
              className="db-view-toggle-btn db-view-toggle-settings"
              onClick={() => setViewSettingsOpen((o) => !o)}
              title="إعدادات الـ View"
              aria-label="إعدادات الـ View"
            >
              <DynamicIcon name="more-vertical" size={14} />
            </button>
            {viewSettingsOpen && (
              <div className="db-select-popover db-view-settings-popover">
                <button
                  type="button"
                  className="db-select-option"
                  onClick={() => {
                    const nextName = window.prompt('اسم الـ View', activeView.name);
                    if (nextName && nextName.trim()) handleUpdateView(activeView.id, { name: nextName.trim() });
                    setViewSettingsOpen(false);
                  }}
                >
                  <DynamicIcon name="pencil" size={13} /> إعادة تسمية
                </button>
                {db.views.length > 1 && (
                  <button
                    type="button"
                    className="db-select-option danger"
                    onClick={() => {
                      setConfirmDeleteView(activeView);
                      setViewSettingsOpen(false);
                    }}
                  >
                    <DynamicIcon name="trash-2" size={13} /> حذف الـ View
                  </button>
                )}
              </div>
            )}
          </div>

          {activeView.type === 'table' && (
            <div className="db-filter-sort-bar">
              <button
                type="button"
                className={`db-filter-sort-btn ${activeView.filters.length ? 'is-active' : ''}`}
                onClick={() => {
                  setFilterPopoverOpen((o) => !o);
                  setSortPopoverOpen(false);
                }}
              >
                <DynamicIcon name="filter" size={13} />
                فلترة {activeView.filters.length > 0 && `(${activeView.filters.length})`}
              </button>
              <button
                type="button"
                className={`db-filter-sort-btn ${activeView.sorts.length ? 'is-active' : ''}`}
                onClick={() => {
                  setSortPopoverOpen((o) => !o);
                  setFilterPopoverOpen(false);
                }}
              >
                <DynamicIcon name="arrow-up-down" size={13} />
                ترتيب {activeView.sorts.length > 0 && `(${activeView.sorts.length})`}
              </button>
              {filterPopoverOpen && (
                <DatabaseFilterPopover
                  properties={db.properties}
                  filters={activeView.filters}
                  onChange={(filters) => handleUpdateView(activeView.id, { filters })}
                  onClose={() => setFilterPopoverOpen(false)}
                />
              )}
              {sortPopoverOpen && (
                <DatabaseSortPopover
                  properties={db.properties}
                  sorts={activeView.sorts}
                  onChange={(sorts) => handleUpdateView(activeView.id, { sorts })}
                  onClose={() => setSortPopoverOpen(false)}
                />
              )}
            </div>
          )}
        </>
      )}

      {activeView?.type === 'board' && db.properties.length > 0 ? (
        <DatabaseBoardView
          db={db}
          view={activeView}
          onSetGroupBy={handleSetBoardGroupBy}
          onOpenAddProperty={() => setAddPropertyOpen(true)}
          onCellChange={handleCellChange}
          onDeleteRow={(rowId) => setConfirmDeleteRow(rowId)}
          onMoveRow={handleMoveRowToColumn}
          onAddRowInColumn={handleAddRowInColumn}
          draggingRowId={draggingRowId}
          setDraggingRowId={setDraggingRowId}
          dragOverColumn={dragOverColumn}
          setDragOverColumn={setDragOverColumn}
          openMoveMenuRowId={openMoveMenuRowId}
          setOpenMoveMenuRowId={setOpenMoveMenuRowId}
          openSelectCell={openSelectCell}
          setOpenSelectCell={setOpenSelectCell}
          convertingRowId={convertingRowId}
          onConvertToTask={handleConvertToTask}
          onUnlinkTask={handleUnlinkTask}
          onOpenTask={onOpenTask}
          relatedDbs={relatedDbs}
          loadingRelatedDbIds={loadingRelatedDbIds}
          onLoadRelatedDb={ensureRelatedDbLoaded}
          onOpenDatabase={onOpenDatabase}
        />
      ) : activeView?.type === 'calendar' && db.properties.length > 0 ? (
        <DatabaseCalendarView
          db={db}
          view={activeView}
          onSetDateBy={handleSetCalendarDateBy}
          onOpenAddProperty={() => setAddPropertyOpen(true)}
          onCellChange={handleCellChange}
          onDeleteRow={(rowId) => setConfirmDeleteRow(rowId)}
          onAddRowOnDate={async (dateIso) => {
            if (!db || !activeView.calendarDateById) return;
            try {
              const row = await addRow(db.id, { [activeView.calendarDateById]: dateIso });
              sounds.addItem();
              setDb((prev) => (prev ? { ...prev, rows: [...prev.rows, row] } : prev));
            } catch (err) {
              sounds.error();
              toast.error(err instanceof Error ? err.message : 'تعذّر إضافة صف');
            }
          }}
          openSelectCell={openSelectCell}
          setOpenSelectCell={setOpenSelectCell}
          relatedDbs={relatedDbs}
          loadingRelatedDbIds={loadingRelatedDbIds}
          onLoadRelatedDb={ensureRelatedDbLoaded}
          onOpenDatabase={onOpenDatabase}
        />
      ) : (
      <div className="db-table-scroll">
        <table className="db-table">
          <thead>
            <tr>
              {db.properties.map((property) => (
                <th key={property.id}>
                  <div className="db-table-col-header">
                    <DynamicIcon name={PROPERTY_TYPE_ICONS[property.type]} size={13} />
                    <span>{property.name}</span>
                    <button
                      type="button"
                      className="icon-btn small"
                      onClick={() => setConfirmDeleteProperty(property)}
                      aria-label={`حذف خاصية ${property.name}`}
                      title="حذف الخاصية"
                    >
                      <DynamicIcon name="x" size={12} />
                    </button>
                  </div>
                </th>
              ))}
              {db.reverseRelationDescriptors.map((desc) => (
                <th key={desc.propertyId} className="db-table-reverse-col">
                  <div className="db-table-col-header">
                    <DynamicIcon name="link-2" size={13} />
                    <span title={`مرتبط من ${desc.sourceDatabaseName}`}>{desc.propertyName}</span>
                  </div>
                </th>
              ))}
              <th className="db-table-task-col">مهمة</th>
              <th className="db-table-add-col">
                <button type="button" className="icon-btn small" onClick={() => setAddPropertyOpen(true)} title="إضافة خاصية">
                  <DynamicIcon name="plus" size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {db.properties.map((property) => (
                  <td key={property.id}>
                    <DatabaseCell
                      property={property}
                      value={row.values[property.id]}
                      onChange={(value) => handleCellChange(row.id, property.id, value)}
                      open={openSelectCell?.rowId === row.id && openSelectCell?.propertyId === property.id}
                      onOpen={() => setOpenSelectCell({ rowId: row.id, propertyId: property.id })}
                      onClose={() => setOpenSelectCell(null)}
                      relatedDbs={relatedDbs}
                      loadingRelatedDbIds={loadingRelatedDbIds}
                      onLoadRelatedDb={ensureRelatedDbLoaded}
                      onOpenDatabase={onOpenDatabase}
                    />
                  </td>
                ))}
                {db.reverseRelationDescriptors.map((desc) => (
                  <td key={desc.propertyId} className="db-table-reverse-col">
                    <ReverseRelationCell
                      entry={row.reverseRelations.find((r) => r.propertyId === desc.propertyId)}
                      onOpenDatabase={onOpenDatabase ? () => onOpenDatabase(desc.sourceDatabaseId) : undefined}
                    />
                  </td>
                ))}
                <td className="db-table-task-col">
                  <TaskLinkControl
                    row={row}
                    converting={convertingRowId === row.id}
                    onConvert={() => handleConvertToTask(row.id)}
                    onUnlink={() => handleUnlinkTask(row.id)}
                    onOpenTask={onOpenTask}
                  />
                </td>
                <td className="db-table-row-actions">
                  <button
                    type="button"
                    className="icon-btn small danger"
                    onClick={() => setConfirmDeleteRow(row.id)}
                    aria-label="حذف الصف"
                    title="حذف الصف"
                  >
                    <DynamicIcon name="trash-2" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleRows.length === 0 && db.rows.length > 0 && (
          <p className="empty small">مفيش صفوف مطابقة للفلاتر الحالية</p>
        )}
      </div>
      )}

      {db.properties.length === 0 && (
        <p className="empty">
          <DynamicIcon name="table" size={32} className="empty-icon" />
          لسه مفيش خصائص (أعمدة)، ابدأ بإضافة أول خاصية
        </p>
      )}

      {activeView?.type === 'table' && (
        <div className="life-area-toolbar">
          <button type="button" className="life-area-new-btn" onClick={handleAddRow} disabled={db.properties.length === 0}>
            <DynamicIcon name="plus" size={16} /> صف جديد
          </button>
        </div>
      )}

      {addViewOpen && (
        <AddViewModal onClose={() => setAddViewOpen(false)} onCreate={handleCreateView} />
      )}

      {confirmDeleteView && (
        <ConfirmModal
          title="حذف الـ View؟"
          description={
            <>
              هيتم حذف View "<strong>{confirmDeleteView.name}</strong>". البيانات نفسها (الصفوف) مش هتتأثر — الـ View ده بس شكل عرض محفوظ.
            </>
          }
          confirmLabel="حذف الـ View"
          onCancel={() => setConfirmDeleteView(null)}
          onConfirm={handleDeleteViewNow}
        />
      )}

      {addPropertyOpen && (
        <AddPropertyModal
          onClose={() => setAddPropertyOpen(false)}
          onCreated={handlePropertyCreated}
          databaseId={db.id}
          ownProperties={db.properties}
        />
      )}

      {confirmDeleteProperty && (
        <ConfirmModal
          title="حذف الخاصية؟"
          description={
            <>
              هيتم حذف خاصية "<strong>{confirmDeleteProperty.name}</strong>" وكل قيمها من كل الصفوف. الإجراء ده مينفعش يترجع.
            </>
          }
          confirmLabel="حذف الخاصية"
          onCancel={() => setConfirmDeleteProperty(null)}
          onConfirm={confirmDeletePropertyNow}
        />
      )}

      {confirmDeleteRow && (
        <ConfirmModal
          title="حذف الصف؟"
          description="هيتم حذف الصف ده وكل قيمه نهائيًا."
          confirmLabel="حذف الصف"
          onCancel={() => setConfirmDeleteRow(null)}
          onConfirm={confirmDeleteRowNow}
        />
      )}
    </div>
  );
}

// ===== خانة واحدة في الجدول — شكل التعديل بيختلف حسب نوع الخاصية =====
function DatabaseCell({
  property,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  relatedDbs,
  loadingRelatedDbIds,
  onLoadRelatedDb,
  onOpenDatabase,
}: {
  property: DatabaseProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  relatedDbs?: Record<string, DatabaseDetail>;
  loadingRelatedDbIds?: Record<string, boolean>;
  onLoadRelatedDb?: (id: string, force?: boolean) => void;
  onOpenDatabase?: (databaseId: string) => void;
}) {
  if (property.type === 'text') {
    return (
      <input
        className="db-cell-input"
        type="text"
        defaultValue={typeof value === 'string' ? value : ''}
        key={typeof value === 'string' ? value : ''}
        onBlur={(e) => {
          if (e.target.value !== (value ?? '')) onChange(e.target.value);
        }}
      />
    );
  }

  if (property.type === 'number') {
    return (
      <input
        className="db-cell-input"
        type="number"
        defaultValue={typeof value === 'number' ? value : ''}
        key={typeof value === 'number' ? value : 'empty'}
        onBlur={(e) => {
          const num = e.target.value === '' ? null : Number(e.target.value);
          if (num !== value) onChange(num);
        }}
      />
    );
  }

  if (property.type === 'date') {
    const dateStr = typeof value === 'string' ? value.slice(0, 10) : '';
    return (
      <input
        className="db-cell-input"
        type="date"
        defaultValue={dateStr}
        key={dateStr}
        onBlur={(e) => {
          if (e.target.value !== dateStr) onChange(e.target.value || null);
        }}
      />
    );
  }

  if (property.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        className="db-cell-checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (property.type === 'rollup') {
    return <RollupCellDisplay config={property.rollupConfig} value={value} />;
  }

  const options: DatabasePropertyOption[] = property.options ?? [];

  if (property.type === 'select') {
    const selected = typeof value === 'string' ? value : null;
    return (
      <div className="db-select-cell">
        <button type="button" className="db-select-trigger" onClick={open ? onClose : onOpen}>
          {selected ? (
            <span className="db-select-badge" style={{ background: options.find((o) => o.value === selected)?.color }}>
              {selected}
            </span>
          ) : (
            <span className="db-select-empty">—</span>
          )}
        </button>
        {open && (
          <div className="db-select-popover">
            <button
              type="button"
              className="db-select-option db-select-clear"
              onClick={() => {
                onChange(null);
                onClose();
              }}
            >
              بدون اختيار
            </button>
            {options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className="db-select-option"
                onClick={() => {
                  onChange(opt.value);
                  onClose();
                }}
              >
                <span className="db-select-badge" style={{ background: opt.color }}>
                  {opt.value}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (property.type === 'multiSelect') {
    const selectedList: string[] = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="db-select-cell">
        <button type="button" className="db-select-trigger" onClick={open ? onClose : onOpen}>
          {selectedList.length > 0 ? (
            <span className="db-select-badges">
              {selectedList.map((v) => (
                <span key={v} className="db-select-badge" style={{ background: options.find((o) => o.value === v)?.color }}>
                  {v}
                </span>
              ))}
            </span>
          ) : (
            <span className="db-select-empty">—</span>
          )}
        </button>
        {open && (
          <div className="db-select-popover">
            {options.map((opt) => {
              const checked = selectedList.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  className={`db-select-option ${checked ? 'is-checked' : ''}`}
                  onClick={() => {
                    const next = checked ? selectedList.filter((v) => v !== opt.value) : [...selectedList, opt.value];
                    onChange(next);
                  }}
                >
                  <DynamicIcon name={checked ? 'check-square' : 'square'} size={13} />
                  <span className="db-select-badge" style={{ background: opt.color }}>
                    {opt.value}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (property.type === 'relation') {
    return (
      <DatabaseRelationCell
        property={property}
        value={value}
        onChange={onChange}
        open={open}
        onOpen={onOpen}
        onClose={onClose}
        relatedDbs={relatedDbs ?? {}}
        loadingRelatedDbIds={loadingRelatedDbIds ?? {}}
        onLoadRelatedDb={onLoadRelatedDb}
        onOpenDatabase={onOpenDatabase}
      />
    );
  }

  return null;
}

// ===== المرحلة 4: خانة خاصية relation — بتعرض شارات بعناوين الصفوف
// المرتبطة (متجابة من كاش القاعدة الهدف)، وبتفتح قائمة اختيار متعدد لكل
// صفوف القاعدة الهدف مع فلترة نصية بسيطة =====
function DatabaseRelationCell({
  property,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  relatedDbs,
  loadingRelatedDbIds,
  onLoadRelatedDb,
  onOpenDatabase,
}: {
  property: DatabaseProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  relatedDbs: Record<string, DatabaseDetail>;
  loadingRelatedDbIds: Record<string, boolean>;
  onLoadRelatedDb?: (id: string, force?: boolean) => void;
  onOpenDatabase?: (databaseId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const relatedDatabaseId = property.relatedDatabaseId;
  const selectedIds: string[] = Array.isArray(value) ? (value as string[]) : [];
  const targetDb = relatedDatabaseId ? relatedDbs[relatedDatabaseId] : undefined;
  const loading = relatedDatabaseId ? !!loadingRelatedDbIds[relatedDatabaseId] : false;
  const labelById = new Map((targetDb?.rows ?? []).map((r) => [r.id, r.label || 'صف بدون عنوان']));

  if (!relatedDatabaseId) {
    return <span className="db-select-empty">القاعدة الهدف اتحذفت</span>;
  }

  function handleOpen() {
    onLoadRelatedDb?.(relatedDatabaseId!);
    onOpen();
  }

  const candidates = (targetDb?.rows ?? []).filter((r) => {
    if (!search.trim()) return true;
    return (r.label || '').toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div className="db-select-cell">
      <button type="button" className="db-select-trigger" onClick={open ? onClose : handleOpen}>
        {selectedIds.length > 0 ? (
          <span className="db-select-badges">
            {selectedIds.map((id) => (
              <span key={id} className="db-relation-badge">
                <DynamicIcon name="link-2" size={11} />
                {labelById.get(id) ?? '…'}
              </span>
            ))}
          </span>
        ) : (
          <span className="db-select-empty">—</span>
        )}
      </button>
      {open && (
        <div className="db-select-popover db-relation-popover">
          <div className="db-relation-popover-header">
            <span>
              مرتبط بـ: {targetDb?.name ?? property.relatedDatabaseName ?? '—'}
            </span>
            {onOpenDatabase && (
              <button
                type="button"
                className="icon-btn small"
                title="فتح القاعدة المرتبطة"
                aria-label="فتح القاعدة المرتبطة"
                onClick={() => {
                  onClose();
                  onOpenDatabase(relatedDatabaseId);
                }}
              >
                <DynamicIcon name="external-link" size={12} />
              </button>
            )}
          </div>
          <input
            className="db-cell-input db-relation-search"
            placeholder="دوّر على صف…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading && <p className="db-relation-loading">جاري التحميل…</p>}
          {!loading && candidates.length === 0 && <p className="db-relation-loading">لا توجد صفوف مطابقة</p>}
          {!loading &&
            candidates.map((row) => {
              const checked = selectedIds.includes(row.id);
              return (
                <button
                  type="button"
                  key={row.id}
                  className={`db-select-option ${checked ? 'is-checked' : ''}`}
                  onClick={() => {
                    const next = checked ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id];
                    onChange(next);
                  }}
                >
                  <DynamicIcon name={checked ? 'check-square' : 'square'} size={13} />
                  <span>{row.label || 'صف بدون عنوان'}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ===== المرحلة 5: عرض قيمة خاصية Rollup — للقراءة بس، القيمة محسوبة من
// السيرفر ومحدش يقدر يعدّلها يدوي من هنا =====
function RollupCellDisplay({ config, value }: { config: RollupConfig | null; value: unknown }) {
  if (!config) return <span className="db-select-empty">—</span>;
  if (config.aggregation === 'showValues') {
    const list = Array.isArray(value) ? value : [];
    if (list.length === 0) return <span className="db-select-empty">—</span>;
    return <span className="db-rollup-value">{list.map((v) => String(v)).join('، ')}</span>;
  }
  if (value === null || value === undefined) return <span className="db-select-empty">—</span>;
  const display = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : String(value);
  return (
    <span className="db-rollup-value">
      <DynamicIcon name="sigma" size={11} />
      {display}
    </span>
  );
}

// ===== المرحلة 5: عرض قيم الربط ثنائي الاتجاه (read-only) في عمود إضافي
// بالجدول — القيمة الحقيقية متخزنة في القاعدة المصدر، هنا بنعرضها بس =====
function ReverseRelationCell({
  entry,
  onOpenDatabase,
}: {
  entry?: { rows: { id: string; label?: string }[] };
  onOpenDatabase?: () => void;
}) {
  if (!entry || entry.rows.length === 0) return <span className="db-select-empty">—</span>;
  return (
    <span className="db-select-badges">
      {entry.rows.map((r) => (
        <button type="button" key={r.id} className="db-relation-badge db-relation-badge-readonly" onClick={onOpenDatabase} title="فتح القاعدة المصدر">
          <DynamicIcon name="link-2" size={11} />
          {r.label || 'صف بدون عنوان'}
        </button>
      ))}
    </span>
  );
}

type SelectCellKey = { rowId: string; propertyId: string } | null;

// ===== المرحلة 3: عنصر تحويل صف لمهمة فعلية / عرض حالتها لو اتحولت
// بالفعل. مستخدم في عرض الجدول وعرض الكانبان مع بعض. =====
function TaskLinkControl({
  row,
  converting,
  onConvert,
  onUnlink,
  onOpenTask,
}: {
  row: DatabaseRowType;
  converting: boolean;
  onConvert: () => void;
  onUnlink: () => void;
  onOpenTask?: () => void;
}) {
  if (!row.linkedTask) {
    return (
      <button type="button" className="db-task-link-btn" onClick={onConvert} disabled={converting} title="تحويل الصف لمهمة فعلية">
        <DynamicIcon name="link-2" size={13} />
        {converting ? 'جاري التحويل…' : 'تحويل لمهمة'}
      </button>
    );
  }

  const done = row.linkedTask.confirmedDone;
  return (
    <div className="db-task-link-badge">
      <button
        type="button"
        className={`db-task-link-status ${done ? 'is-done' : ''}`}
        onClick={onOpenTask}
        title={done ? 'المهمة منجزة — اضغط لفتح قائمة المهام' : 'اضغط لفتح قائمة المهام'}
      >
        <DynamicIcon name={done ? 'check-circle' : 'circle'} size={13} />
        <span>{row.linkedTask.title}</span>
      </button>
      <button type="button" className="icon-btn small" onClick={onUnlink} title="فك الربط عن المهمة" aria-label="فك الربط">
        <DynamicIcon name="x" size={12} />
      </button>
    </div>
  );
}

// ===== عرض Board (كانبان) — المرحلة 2. بيحوّل خاصية "اختيار واحد" لأعمدة،
// وكل صف بيتحول لكارت جوه العمود اللي بيمثّل قيمته الحالية في الخاصية دي.
// النقل بين الأعمدة إما بالسحب المباشر (draggable) أو عن طريق زرار "نقل"
// كبديل يعتمد على اللمس (touch) عشان يشتغل كويس على الموبايل كمان. =====
function DatabaseBoardView({
  db,
  view,
  onSetGroupBy,
  onOpenAddProperty,
  onCellChange,
  onDeleteRow,
  onMoveRow,
  onAddRowInColumn,
  draggingRowId,
  setDraggingRowId,
  dragOverColumn,
  setDragOverColumn,
  openMoveMenuRowId,
  setOpenMoveMenuRowId,
  openSelectCell,
  setOpenSelectCell,
  convertingRowId,
  onConvertToTask,
  onUnlinkTask,
  onOpenTask,
  relatedDbs,
  loadingRelatedDbIds,
  onLoadRelatedDb,
  onOpenDatabase,
}: {
  db: DatabaseDetail;
  view: DatabaseSavedView;
  onSetGroupBy: (propertyId: string) => void;
  onOpenAddProperty: () => void;
  onCellChange: (rowId: string, propertyId: string, value: unknown) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, groupPropertyId: string, columnValue: string | null) => void;
  onAddRowInColumn: (groupPropertyId: string, columnValue: string | null) => void;
  draggingRowId: string | null;
  setDraggingRowId: (id: string | null) => void;
  dragOverColumn: string | null;
  setDragOverColumn: (key: string | null) => void;
  openMoveMenuRowId: string | null;
  setOpenMoveMenuRowId: (id: string | null) => void;
  openSelectCell: SelectCellKey;
  setOpenSelectCell: (key: SelectCellKey) => void;
  convertingRowId: string | null;
  onConvertToTask: (rowId: string) => void;
  onUnlinkTask: (rowId: string) => void;
  onOpenTask?: () => void;
  relatedDbs: Record<string, DatabaseDetail>;
  loadingRelatedDbIds: Record<string, boolean>;
  onLoadRelatedDb: (id: string, force?: boolean) => void;
  onOpenDatabase?: (databaseId: string) => void;
}) {
  const selectProperties = db.properties.filter((p) => p.type === 'select');
  const groupProperty = db.properties.find((p) => p.id === view.boardGroupById && p.type === 'select') ?? null;

  // ===== لسه محتاجين نحدد خاصية التجميع =====
  if (!groupProperty) {
    return (
      <div className="db-board-picker">
        <DynamicIcon name="columns-3" size={30} className="empty-icon" />
        {selectProperties.length === 0 ? (
          <>
            <p className="empty">
              عرض الكانبان بيحتاج خاصية من نوع "اختيار واحد" تتحول لأعمدة — لسه معندكش واحدة في القاعدة دي.
            </p>
            <button type="button" className="life-area-new-btn" onClick={onOpenAddProperty}>
              <DynamicIcon name="plus" size={16} /> إضافة خاصية اختيار واحد
            </button>
          </>
        ) : (
          <>
            <p className="empty">اختَر الخاصية اللي هتتحول لأعمدة الكانبان:</p>
            <div className="db-board-property-picker">
              {selectProperties.map((p) => (
                <button type="button" key={p.id} className="db-board-property-choice" onClick={() => onSetGroupBy(p.id)}>
                  <DynamicIcon name="circle-dot" size={14} />
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const options = groupProperty.options ?? [];
  const otherProperties = db.properties.filter((p) => p.id !== groupProperty.id);
  const optionValues = new Set(options.map((o) => o.value));

  const rowsByColumn = new Map<string, DatabaseRowType[]>();
  rowsByColumn.set('__none__', []);
  for (const opt of options) rowsByColumn.set(opt.value, []);
  for (const row of db.rows) {
    const value = row.values[groupProperty.id];
    const key = typeof value === 'string' && optionValues.has(value) ? value : '__none__';
    rowsByColumn.get(key)!.push(row);
  }

  const columns: { key: string; label: string; color?: string }[] = [
    { key: '__none__', label: 'بدون تصنيف' },
    ...options.map((o) => ({ key: o.value, label: o.value, color: o.color })),
  ];

  return (
    <div className="db-board-scroll">
      <div className="db-board-columns">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`db-board-column ${dragOverColumn === col.key ? 'is-drop-target' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverColumn !== col.key) setDragOverColumn(col.key);
            }}
            onDragLeave={() => {
              if (dragOverColumn === col.key) setDragOverColumn(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverColumn(null);
              if (draggingRowId) {
                onMoveRow(draggingRowId, groupProperty.id, col.key === '__none__' ? null : col.key);
              }
              setDraggingRowId(null);
            }}
          >
            <div className="db-board-column-header">
              {col.color ? (
                <span className="db-select-badge" style={{ background: col.color }}>
                  {col.label}
                </span>
              ) : (
                <span className="db-board-column-title">{col.label}</span>
              )}
              <span className="db-board-column-count">{rowsByColumn.get(col.key)!.length}</span>
              <button
                type="button"
                className="icon-btn small"
                title="صف جديد في العمود ده"
                aria-label={`إضافة صف في ${col.label}`}
                onClick={() => onAddRowInColumn(groupProperty.id, col.key === '__none__' ? null : col.key)}
              >
                <DynamicIcon name="plus" size={13} />
              </button>
            </div>

            <div className="db-board-column-body">
              {rowsByColumn.get(col.key)!.map((row) => (
                <div
                  key={row.id}
                  draggable
                  className={`db-board-card ${draggingRowId === row.id ? 'is-dragging' : ''}`}
                  onDragStart={(e) => {
                    setDraggingRowId(row.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', row.id);
                  }}
                  onDragEnd={() => {
                    setDraggingRowId(null);
                    setDragOverColumn(null);
                  }}
                >
                  <div className="db-board-card-header">
                    <DynamicIcon name="grip-vertical" size={13} className="db-board-card-grip" />
                    <div className="db-board-card-actions">
                      <button
                        type="button"
                        className="icon-btn small"
                        title="نقل لعمود تاني"
                        aria-label="نقل لعمود تاني"
                        onClick={() => setOpenMoveMenuRowId(openMoveMenuRowId === row.id ? null : row.id)}
                      >
                        <DynamicIcon name="more-vertical" size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn small danger"
                        title="حذف الصف"
                        aria-label="حذف الصف"
                        onClick={() => onDeleteRow(row.id)}
                      >
                        <DynamicIcon name="trash-2" size={13} />
                      </button>
                      {openMoveMenuRowId === row.id && (
                        <div className="db-select-popover db-board-move-popover">
                          {columns
                            .filter((c) => c.key !== col.key)
                            .map((c) => (
                              <button
                                type="button"
                                key={c.key}
                                className="db-select-option"
                                onClick={() => onMoveRow(row.id, groupProperty.id, c.key === '__none__' ? null : c.key)}
                              >
                                نقل إلى: {c.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {otherProperties.map((property) => (
                    <div key={property.id} className="db-board-card-field">
                      <span className="db-board-card-field-label">{property.name}</span>
                      <DatabaseCell
                        property={property}
                        value={row.values[property.id]}
                        onChange={(value) => onCellChange(row.id, property.id, value)}
                        open={openSelectCell?.rowId === row.id && openSelectCell?.propertyId === property.id}
                        onOpen={() => setOpenSelectCell({ rowId: row.id, propertyId: property.id })}
                        onClose={() => setOpenSelectCell(null)}
                        relatedDbs={relatedDbs}
                        loadingRelatedDbIds={loadingRelatedDbIds}
                        onLoadRelatedDb={onLoadRelatedDb}
                        onOpenDatabase={onOpenDatabase}
                      />
                    </div>
                  ))}

                  {otherProperties.length === 0 && <p className="db-board-card-empty">لا يوجد خصائص إضافية</p>}

                  {db.reverseRelationDescriptors.map((desc) => {
                    const entry = row.reverseRelations.find((r) => r.propertyId === desc.propertyId);
                    if (!entry || entry.rows.length === 0) return null;
                    return (
                      <div key={desc.propertyId} className="db-board-card-field">
                        <span className="db-board-card-field-label">{desc.propertyName}</span>
                        <ReverseRelationCell entry={entry} onOpenDatabase={onOpenDatabase ? () => onOpenDatabase(desc.sourceDatabaseId) : undefined} />
                      </div>
                    );
                  })}

                  <div className="db-board-card-task">
                    <TaskLinkControl
                      row={row}
                      converting={convertingRowId === row.id}
                      onConvert={() => onConvertToTask(row.id)}
                      onUnlink={() => onUnlinkTask(row.id)}
                      onOpenTask={onOpenTask}
                    />
                  </div>
                </div>
              ))}

              {rowsByColumn.get(col.key)!.length === 0 && <p className="db-board-column-empty">لا صفوف هنا</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== المرحلة 5: بوباب اختيار وإدارة فلاتر الجدول =====
function DatabaseFilterPopover({
  properties,
  filters,
  onChange,
  onClose,
}: {
  properties: DatabaseProperty[];
  filters: DatabaseFilter[];
  onChange: (filters: DatabaseFilter[]) => void;
  onClose: () => void;
}) {
  const filterable = properties.filter((p) => p.type !== 'rollup' || true);

  function addFilter() {
    const property = filterable[0];
    if (!property) return;
    const operator = operatorsForType(property.type)[0];
    onChange([...filters, { propertyId: property.id, operator, value: '' }]);
  }

  function updateFilter(index: number, patch: Partial<DatabaseFilter>) {
    onChange(filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }

  return (
    <div className="db-select-popover db-filter-popover" onClick={(e) => e.stopPropagation()}>
      {filters.length === 0 && <p className="empty small">مفيش فلاتر — الجدول بيعرض كل الصفوف</p>}
      {filters.map((filter, index) => {
        const property = properties.find((p) => p.id === filter.propertyId);
        const ops = property ? operatorsForType(property.type) : [];
        const needsValue = filter.operator !== 'isEmpty' && filter.operator !== 'isNotEmpty';
        return (
          <div key={index} className="db-filter-row">
            <select
              className="db-cell-input"
              value={filter.propertyId}
              onChange={(e) => {
                const p = properties.find((pp) => pp.id === e.target.value);
                if (!p) return;
                updateFilter(index, { propertyId: p.id, operator: operatorsForType(p.type)[0], value: '' });
              }}
            >
              {filterable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="db-cell-input"
              value={filter.operator}
              onChange={(e) => updateFilter(index, { operator: e.target.value as FilterOperator, value: '' })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {FILTER_OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            {needsValue &&
              (property?.type === 'checkbox' ? (
                <select className="db-cell-input" value={String(filter.value ?? 'true')} onChange={(e) => updateFilter(index, { value: e.target.value === 'true' })}>
                  <option value="true">✓</option>
                  <option value="false">✗</option>
                </select>
              ) : property?.type === 'select' || property?.type === 'multiSelect' || property?.type === 'relation' ? (
                <select className="db-cell-input" value={String(filter.value ?? '')} onChange={(e) => updateFilter(index, { value: e.target.value })}>
                  <option value="">—</option>
                  {(property.type === 'relation' ? [] : property.options).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="db-cell-input"
                  type={property?.type === 'number' ? 'number' : property?.type === 'date' ? 'date' : 'text'}
                  value={String(filter.value ?? '')}
                  onChange={(e) => updateFilter(index, { value: property?.type === 'number' ? Number(e.target.value) : e.target.value })}
                />
              ))}
            <button type="button" className="icon-btn small danger" onClick={() => removeFilter(index)} aria-label="حذف الفلتر">
              <DynamicIcon name="x" size={12} />
            </button>
          </div>
        );
      })}
      <div className="db-filter-popover-actions">
        <button type="button" className="icon-btn small" onClick={addFilter} disabled={filterable.length === 0}>
          <DynamicIcon name="plus" size={13} /> فلتر جديد
        </button>
        <button type="button" className="icon-btn small" onClick={onClose}>
          تم
        </button>
      </div>
    </div>
  );
}

// ===== المرحلة 5: بوباب اختيار وإدارة ترتيب الجدول =====
function DatabaseSortPopover({
  properties,
  sorts,
  onChange,
  onClose,
}: {
  properties: DatabaseProperty[];
  sorts: DatabaseSort[];
  onChange: (sorts: DatabaseSort[]) => void;
  onClose: () => void;
}) {
  function addSort() {
    const remaining = properties.filter((p) => !sorts.some((s) => s.propertyId === p.id));
    const property = remaining[0];
    if (!property) return;
    onChange([...sorts, { propertyId: property.id, direction: 'asc' }]);
  }

  function updateSort(index: number, patch: Partial<DatabaseSort>) {
    onChange(sorts.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSort(index: number) {
    onChange(sorts.filter((_, i) => i !== index));
  }

  return (
    <div className="db-select-popover db-filter-popover" onClick={(e) => e.stopPropagation()}>
      {sorts.length === 0 && <p className="empty small">الصفوف بترتيبها الطبيعي — مفيش ترتيب مخصص</p>}
      {sorts.map((sort, index) => (
        <div key={index} className="db-filter-row">
          <select
            className="db-cell-input"
            value={sort.propertyId}
            onChange={(e) => updateSort(index, { propertyId: e.target.value })}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="db-cell-input" value={sort.direction} onChange={(e) => updateSort(index, { direction: e.target.value as 'asc' | 'desc' })}>
            <option value="asc">تصاعدي (أ-ي / أصغر-أكبر)</option>
            <option value="desc">تنازلي (ي-أ / أكبر-أصغر)</option>
          </select>
          <button type="button" className="icon-btn small danger" onClick={() => removeSort(index)} aria-label="حذف قاعدة الترتيب">
            <DynamicIcon name="x" size={12} />
          </button>
        </div>
      ))}
      <div className="db-filter-popover-actions">
        <button type="button" className="icon-btn small" onClick={addSort} disabled={sorts.length >= properties.length}>
          <DynamicIcon name="plus" size={13} /> قاعدة ترتيب جديدة
        </button>
        <button type="button" className="icon-btn small" onClick={onClose}>
          تم
        </button>
      </div>
    </div>
  );
}

// ===== المرحلة 5: نافذة صغيرة لإنشاء View جديد (اسم + نوع) =====
function AddViewModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, type: DatabaseViewType) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DatabaseViewType>('table');
  const trimmed = name.trim();

  return (
    <div className="modal-overlay add-task-overlay" onClick={onClose}>
      <div className="modal-box add-task-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="add-task-header">
          <h2>
            <span className="add-task-header-text">
              <span className="add-task-header-step">View جديد</span>
              <span className="add-task-header-title">إضافة عرض</span>
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>
        <div className="add-task-body">
          <div className="add-task-field">
            <label htmlFor="view-name" className="add-task-label">
              اسم الـ View
            </label>
            <input
              id="view-name"
              className="add-task-title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مهامي بس، الكتب المتأخرة"
              maxLength={40}
            />
          </div>
          <div className="add-task-field">
            <span className="add-task-label">النوع</span>
            <div className="db-property-type-grid">
              <button type="button" className={`db-property-type-choice ${type === 'table' ? 'selected' : ''}`} onClick={() => setType('table')}>
                <DynamicIcon name="table" size={14} /> جدول
              </button>
              <button type="button" className={`db-property-type-choice ${type === 'board' ? 'selected' : ''}`} onClick={() => setType('board')}>
                <DynamicIcon name="columns-3" size={14} /> كانبان
              </button>
              <button type="button" className={`db-property-type-choice ${type === 'calendar' ? 'selected' : ''}`} onClick={() => setType('calendar')}>
                <DynamicIcon name="calendar-range" size={14} /> تقويم
              </button>
            </div>
          </div>
        </div>
        <div className="add-task-footer">
          <button className="small" type="button" onClick={onClose}>
            إلغاء
          </button>
          <button className="add-task-submit" type="button" disabled={!trimmed} onClick={() => onCreate(trimmed, type)}>
            إنشاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== المرحلة 5: عرض التقويم — بيحوّل خاصية من نوع تاريخ لشبكة شهرية،
// كل يوم بيعرض الصفوف اللي تاريخها يقع فيه، مع إمكانية إضافة صف جديد
// بتاريخ اليوم ده مباشرة =====
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const ARABIC_WEEKDAYS = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];

function DatabaseCalendarView({
  db,
  view,
  onSetDateBy,
  onOpenAddProperty,
  onCellChange,
  onDeleteRow,
  onAddRowOnDate,
  openSelectCell,
  setOpenSelectCell,
  relatedDbs,
  loadingRelatedDbIds,
  onLoadRelatedDb,
  onOpenDatabase,
}: {
  db: DatabaseDetail;
  view: DatabaseSavedView;
  onSetDateBy: (propertyId: string) => void;
  onOpenAddProperty: () => void;
  onCellChange: (rowId: string, propertyId: string, value: unknown) => void;
  onDeleteRow: (rowId: string) => void;
  onAddRowOnDate: (dateIso: string) => void;
  openSelectCell: SelectCellKey;
  setOpenSelectCell: (key: SelectCellKey) => void;
  relatedDbs: Record<string, DatabaseDetail>;
  loadingRelatedDbIds: Record<string, boolean>;
  onLoadRelatedDb: (id: string, force?: boolean) => void;
  onOpenDatabase?: (databaseId: string) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const dateProperties = db.properties.filter((p) => p.type === 'date');
  const dateProperty = db.properties.find((p) => p.id === view.calendarDateById && p.type === 'date') ?? null;

  if (!dateProperty) {
    return (
      <div className="db-board-picker">
        <DynamicIcon name="calendar-range" size={30} className="empty-icon" />
        {dateProperties.length === 0 ? (
          <>
            <p className="empty">عرض التقويم بيحتاج خاصية من نوع "تاريخ" — لسه معندكش واحدة في القاعدة دي.</p>
            <button type="button" className="life-area-new-btn" onClick={onOpenAddProperty}>
              <DynamicIcon name="plus" size={16} /> إضافة خاصية تاريخ
            </button>
          </>
        ) : (
          <>
            <p className="empty">اختَر خاصية التاريخ اللي التقويم هيتبني عليها:</p>
            <div className="db-board-property-picker">
              {dateProperties.map((p) => (
                <button type="button" key={p.id} className="db-board-property-choice" onClick={() => onSetDateBy(p.id)}>
                  <DynamicIcon name="calendar-days" size={14} />
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  const rowsByDate = new Map<string, DatabaseRowType[]>();
  for (const row of db.rows) {
    const raw = row.values[dateProperty.id];
    if (typeof raw !== 'string' || !raw) continue;
    const key = raw.slice(0, 10);
    if (!rowsByDate.has(key)) rowsByDate.set(key, []);
    rowsByDate.get(key)!.push(row);
  }

  const otherProperties = db.properties.filter((p) => p.id !== dateProperty.id);
  const cells: { dateIso: string | null; day: number | null }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ dateIso: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ dateIso, day: d });
  }

  return (
    <div className="db-calendar">
      <div className="db-calendar-header">
        <button type="button" className="icon-btn small" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="الشهر السابق">
          <DynamicIcon name="chevron-right" size={16} />
        </button>
        <strong>
          {ARABIC_MONTHS[month]} {year}
        </strong>
        <button type="button" className="icon-btn small" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="الشهر الجاي">
          <DynamicIcon name="chevron-left" size={16} />
        </button>
        <button type="button" className="icon-btn small" onClick={() => setCursor(new Date())} title="النهارده">
          <DynamicIcon name="calendar" size={14} />
        </button>
      </div>
      <div className="db-calendar-weekdays">
        {ARABIC_WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="db-calendar-grid">
        {cells.map((cell, index) => (
          <div key={index} className={`db-calendar-cell ${cell.dateIso === todayIso ? 'is-today' : ''} ${!cell.dateIso ? 'is-empty' : ''}`}>
            {cell.dateIso && (
              <>
                <div className="db-calendar-cell-header">
                  <span>{cell.day}</span>
                  <button
                    type="button"
                    className="icon-btn small"
                    title="صف جديد في اليوم ده"
                    aria-label={`إضافة صف بتاريخ ${cell.dateIso}`}
                    onClick={() => onAddRowOnDate(cell.dateIso!)}
                  >
                    <DynamicIcon name="plus" size={11} />
                  </button>
                </div>
                <div className="db-calendar-cell-body">
                  {(rowsByDate.get(cell.dateIso) ?? []).map((row) => (
                    <div key={row.id} className="db-calendar-item">
                      <button
                        type="button"
                        className="db-calendar-item-title"
                        onClick={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
                      >
                        {row.label || 'صف بدون عنوان'}
                      </button>
                      {expandedRowId === row.id && (
                        <div className="db-calendar-item-detail">
                          {otherProperties.map((property) => (
                            <div key={property.id} className="db-board-card-field">
                              <span className="db-board-card-field-label">{property.name}</span>
                              <DatabaseCell
                                property={property}
                                value={row.values[property.id]}
                                onChange={(value) => onCellChange(row.id, property.id, value)}
                                open={openSelectCell?.rowId === row.id && openSelectCell?.propertyId === property.id}
                                onOpen={() => setOpenSelectCell({ rowId: row.id, propertyId: property.id })}
                                onClose={() => setOpenSelectCell(null)}
                                relatedDbs={relatedDbs}
                                loadingRelatedDbIds={loadingRelatedDbIds}
                                onLoadRelatedDb={onLoadRelatedDb}
                                onOpenDatabase={onOpenDatabase}
                              />
                            </div>
                          ))}
                          <button type="button" className="icon-btn small danger" onClick={() => onDeleteRow(row.id)}>
                            <DynamicIcon name="trash-2" size={12} /> حذف الصف
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== نافذة إضافة خاصية (عمود) جديدة — لو النوع select/multiSelect،
// بتسمح بإضافة خيارات (نص + لون) قبل الحفظ =====
function AddPropertyModal({
  databaseId,
  ownProperties,
  onClose,
  onCreated,
}: {
  databaseId: string;
  ownProperties: DatabaseProperty[];
  onClose: () => void;
  onCreated: (property: DatabaseProperty) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DatabasePropertyType>('text');
  const [options, setOptions] = useState<DatabasePropertyOption[]>([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionColor, setNewOptionColor] = useState(DEFAULT_LIFE_AREA_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ===== المرحلة 4: قائمة قواعد بيانات المستخدم عشان يختار القاعدة الهدف
  // لخاصية relation — بتتحمّل أول ما المستخدم يختار النوع ده =====
  const [availableDatabases, setAvailableDatabases] = useState<DatabaseSummary[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [relatedDatabaseId, setRelatedDatabaseId] = useState('');

  // ===== المرحلة 5: إعدادات خاصية Rollup =====
  const [rollupRelationPropertyId, setRollupRelationPropertyId] = useState('');
  const [rollupAggregation, setRollupAggregation] = useState<RollupAggregation>('count');
  const [rollupTargetPropertyId, setRollupTargetPropertyId] = useState('');
  const [rollupTargetProperties, setRollupTargetProperties] = useState<DatabaseProperty[]>([]);
  const [loadingRollupTargets, setLoadingRollupTargets] = useState(false);

  const relationProperties = ownProperties.filter((p) => p.type === 'relation');

  const needsOptions = type === 'select' || type === 'multiSelect';
  const needsRelatedDatabase = type === 'relation';
  const needsRollupConfig = type === 'rollup';
  const trimmedName = name.trim();

  useEffect(() => {
    if (type !== 'relation' || availableDatabases.length > 0 || loadingDatabases) return;
    setLoadingDatabases(true);
    getDatabases()
      .then(setAvailableDatabases)
      .catch(() => setError('تعذّر تحميل قواعد البيانات'))
      .finally(() => setLoadingDatabases(false));
  }, [type]);

  // لما يختار خاصية relation للـ rollup، لازم نجيب خصائص القاعدة الهدف
  // بتاعتها عشان يختار منها الخاصية اللي هيتم التجميع عليها
  useEffect(() => {
    if (type !== 'rollup' || !rollupRelationPropertyId) {
      setRollupTargetProperties([]);
      return;
    }
    const relationProperty = relationProperties.find((p) => p.id === rollupRelationPropertyId);
    if (!relationProperty?.relatedDatabaseId) {
      setRollupTargetProperties([]);
      return;
    }
    setLoadingRollupTargets(true);
    getDatabase(relationProperty.relatedDatabaseId)
      .then((target) => setRollupTargetProperties(target.properties.filter((p) => p.type !== 'rollup')))
      .catch(() => setError('تعذّر تحميل خصائص القاعدة المرتبطة'))
      .finally(() => setLoadingRollupTargets(false));
  }, [type, rollupRelationPropertyId]);

  function addOption() {
    const value = newOptionName.trim();
    if (!value) return;
    if (options.some((o) => o.value === value)) {
      setError('فيه اختيار بنفس الاسم بالفعل');
      return;
    }
    setOptions((prev) => [...prev, { value, color: newOptionColor }]);
    setNewOptionName('');
  }

  async function handleSave() {
    if (!trimmedName) {
      setError('لازم تكتب اسم للخاصية');
      return;
    }
    if (needsOptions && options.length === 0) {
      setError('لازم تضيف اختيار واحد على الأقل');
      return;
    }
    if (needsRelatedDatabase && !relatedDatabaseId) {
      setError('لازم تختار القاعدة اللي هتترتبط بيها');
      return;
    }
    if (needsRollupConfig) {
      if (!rollupRelationPropertyId) {
        setError('لازم تختار خاصية ربط (relation) تحسب منها');
        return;
      }
      if (rollupAggregation !== 'count' && !rollupTargetPropertyId) {
        setError('لازم تختار الخاصية اللي هيتم التجميع عليها');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const rollupConfig: RollupConfig | undefined = needsRollupConfig
        ? { relationPropertyId: rollupRelationPropertyId, targetPropertyId: rollupAggregation === 'count' ? null : rollupTargetPropertyId, aggregation: rollupAggregation }
        : undefined;
      const property = await addProperty(databaseId, {
        name: trimmedName,
        type,
        options: needsOptions ? options : undefined,
        relatedDatabaseId: needsRelatedDatabase ? relatedDatabaseId : undefined,
        rollupConfig,
      });
      sounds.addItem();
      onCreated(property);
    } catch (err) {
      sounds.error();
      const message = err instanceof Error ? err.message : 'تعذّر إضافة الخاصية';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay add-task-overlay" onClick={onClose}>
      <div
        className="modal-box add-task-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-property-title"
      >
        <div className="add-task-header">
          <h2 id="add-property-title">
            <span className="add-task-header-text">
              <span className="add-task-header-step">خاصية جديدة</span>
              <span className="add-task-header-title">إضافة عمود</span>
            </span>
          </h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="إغلاق">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <div className="add-task-body">
          <div className="add-task-field">
            <label htmlFor="property-name" className="add-task-label">
              اسم الخاصية
            </label>
            <input
              id="property-name"
              className="add-task-title-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="مثال: الحالة، السعر، التاريخ"
              maxLength={40}
            />
          </div>

          <div className="add-task-field">
            <span className="add-task-label">النوع</span>
            <div className="db-property-type-grid">
              {(Object.keys(PROPERTY_TYPE_LABELS) as DatabasePropertyType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`db-property-type-choice ${type === t ? 'selected' : ''}`}
                  onClick={() => setType(t)}
                >
                  <DynamicIcon name={PROPERTY_TYPE_ICONS[t]} size={14} />
                  {PROPERTY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {needsOptions && (
            <div className="add-task-field">
              <span className="add-task-label">الاختيارات</span>
              <div className="db-options-list">
                {options.map((opt) => (
                  <span key={opt.value} className="db-select-badge db-option-chip" style={{ background: opt.color }}>
                    {opt.value}
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((o) => o.value !== opt.value))}
                      aria-label={`حذف اختيار ${opt.value}`}
                    >
                      <DynamicIcon name="x" size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="db-add-option-row">
                <input
                  className="db-cell-input"
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  placeholder="اسم اختيار جديد"
                  maxLength={30}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                />
                <ColorPicker value={newOptionColor} onChange={setNewOptionColor} />
                <button type="button" className="icon-btn small" onClick={addOption} title="إضافة اختيار">
                  <DynamicIcon name="plus" size={14} />
                </button>
              </div>
            </div>
          )}

          {needsRelatedDatabase && (
            <div className="add-task-field">
              <span className="add-task-label">القاعدة المرتبطة</span>
              {loadingDatabases ? (
                <p className="empty small">جاري تحميل قواعدك…</p>
              ) : availableDatabases.length === 0 ? (
                <p className="empty small">معندكش قواعد بيانات تانية تقدر ترتبط بيها</p>
              ) : (
                <div className="db-options-list db-relation-target-list">
                  {availableDatabases.map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      className={`db-board-property-choice ${relatedDatabaseId === d.id ? 'selected' : ''}`}
                      onClick={() => setRelatedDatabaseId(d.id)}
                    >
                      <DynamicIcon name={d.icon ?? 'table'} size={14} />
                      {d.name}
                      {d.id === databaseId && ' (نفس القاعدة)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {needsRollupConfig && (
            <div className="add-task-field">
              <span className="add-task-label">خاصية الربط (Relation) اللي هنحسب منها</span>
              {relationProperties.length === 0 ? (
                <p className="empty small">لازم يكون عندك خاصية relation في القاعدة دي الأول قبل ما تضيف Rollup</p>
              ) : (
                <div className="db-options-list db-relation-target-list">
                  {relationProperties.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`db-board-property-choice ${rollupRelationPropertyId === p.id ? 'selected' : ''}`}
                      onClick={() => {
                        setRollupRelationPropertyId(p.id);
                        setRollupTargetPropertyId('');
                      }}
                    >
                      <DynamicIcon name="link-2" size={14} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {rollupRelationPropertyId && (
                <>
                  <span className="add-task-label" style={{ marginTop: 10 }}>
                    نوع التجميع
                  </span>
                  <select className="db-cell-input" value={rollupAggregation} onChange={(e) => setRollupAggregation(e.target.value as RollupAggregation)}>
                    {(Object.keys(ROLLUP_AGGREGATION_LABELS) as RollupAggregation[]).map((agg) => (
                      <option key={agg} value={agg}>
                        {ROLLUP_AGGREGATION_LABELS[agg]}
                      </option>
                    ))}
                  </select>

                  {rollupAggregation !== 'count' && (
                    <>
                      <span className="add-task-label" style={{ marginTop: 10 }}>
                        الخاصية اللي هيتم التجميع عليها
                      </span>
                      {loadingRollupTargets ? (
                        <p className="empty small">جاري التحميل…</p>
                      ) : rollupTargetProperties.length === 0 ? (
                        <p className="empty small">القاعدة المرتبطة معندهاش خصائص تصلح للتجميع</p>
                      ) : (
                        <div className="db-options-list db-relation-target-list">
                          {rollupTargetProperties.map((p) => (
                            <button
                              type="button"
                              key={p.id}
                              className={`db-board-property-choice ${rollupTargetPropertyId === p.id ? 'selected' : ''}`}
                              onClick={() => setRollupTargetPropertyId(p.id)}
                            >
                              <DynamicIcon name={PROPERTY_TYPE_ICONS[p.type]} size={14} />
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="wizard-step-error" role="alert">
              <DynamicIcon name="alert" size={13} /> {error}
            </p>
          )}
        </div>

        <div className="add-task-footer">
          <button className="small" type="button" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button className="add-task-submit" type="button" onClick={handleSave} disabled={saving || !trimmedName}>
            {saving ? 'جاري الإضافة…' : 'إضافة الخاصية'}
          </button>
        </div>
      </div>
    </div>
  );
}

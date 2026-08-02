import { useEffect, useState } from 'react';
import {
  getDatabase,
  getDatabases,
  addProperty,
  deleteProperty,
  addRow,
  updateRow,
  deleteRow,
  updateDatabase,
  convertRowToTask,
  unlinkRowTask,
  DatabaseDetail,
  DatabaseSummary,
  DatabaseProperty,
  DatabasePropertyType,
  DatabasePropertyOption,
  DatabaseViewType,
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
};

const PROPERTY_TYPE_ICONS: Record<DatabasePropertyType, string> = {
  text: 'text',
  number: 'hash',
  select: 'circle-dot',
  multiSelect: 'list-checks',
  date: 'calendar-days',
  checkbox: 'check-square',
  relation: 'link-2',
};

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

  // ===== المرحلة 2: تبديل نوع العرض (جدول/كانبان) — بيتخزّن على السيرفر
  // عشان يفضل محفوظ لما ترجع للقاعدة دي تاني =====
  async function handleSwitchViewType(viewType: DatabaseViewType) {
    if (!db || db.viewType === viewType) return;
    const previous = db.viewType;
    setDb((prev) => (prev ? { ...prev, viewType } : prev));
    setSwitchingView(true);
    try {
      await updateDatabase(db.id, { viewType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تبديل العرض');
      setDb((prev) => (prev ? { ...prev, viewType: previous } : prev));
    } finally {
      setSwitchingView(false);
    }
  }

  // ===== اختيار الخاصية اللي هتتحول لأعمدة الكانبان (لازم تكون اختيار واحد) =====
  async function handleSetBoardGroupBy(propertyId: string) {
    if (!db) return;
    setSwitchingView(true);
    try {
      const updated = await updateDatabase(db.id, { boardGroupById: propertyId });
      setDb((prev) => (prev ? { ...prev, boardGroupById: updated.boardGroupById } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر اختيار خاصية التجميع');
    } finally {
      setSwitchingView(false);
    }
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

      {db.properties.length > 0 && (
        <div className="db-view-toggle" role="tablist" aria-label="نوع العرض">
          <button
            type="button"
            role="tab"
            aria-selected={db.viewType === 'table'}
            className={`db-view-toggle-btn ${db.viewType === 'table' ? 'is-active' : ''}`}
            onClick={() => handleSwitchViewType('table')}
            disabled={switchingView}
          >
            <DynamicIcon name="table" size={14} />
            جدول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={db.viewType === 'board'}
            className={`db-view-toggle-btn ${db.viewType === 'board' ? 'is-active' : ''}`}
            onClick={() => handleSwitchViewType('board')}
            disabled={switchingView}
          >
            <DynamicIcon name="columns-3" size={14} />
            كانبان
          </button>
        </div>
      )}

      {db.viewType === 'board' && db.properties.length > 0 ? (
        <DatabaseBoardView
          db={db}
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
              <th className="db-table-task-col">مهمة</th>
              <th className="db-table-add-col">
                <button type="button" className="icon-btn small" onClick={() => setAddPropertyOpen(true)} title="إضافة خاصية">
                  <DynamicIcon name="plus" size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {db.rows.map((row) => (
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
      </div>
      )}

      {db.properties.length === 0 && (
        <p className="empty">
          <DynamicIcon name="table" size={32} className="empty-icon" />
          لسه مفيش خصائص (أعمدة)، ابدأ بإضافة أول خاصية
        </p>
      )}

      {db.viewType === 'table' && (
        <div className="life-area-toolbar">
          <button type="button" className="life-area-new-btn" onClick={handleAddRow} disabled={db.properties.length === 0}>
            <DynamicIcon name="plus" size={16} /> صف جديد
          </button>
        </div>
      )}

      {addPropertyOpen && (
        <AddPropertyModal
          onClose={() => setAddPropertyOpen(false)}
          onCreated={handlePropertyCreated}
          databaseId={db.id}
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
  const groupProperty = db.properties.find((p) => p.id === db.boardGroupById && p.type === 'select') ?? null;

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

// ===== نافذة إضافة خاصية (عمود) جديدة — لو النوع select/multiSelect،
// بتسمح بإضافة خيارات (نص + لون) قبل الحفظ =====
function AddPropertyModal({
  databaseId,
  onClose,
  onCreated,
}: {
  databaseId: string;
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

  const needsOptions = type === 'select' || type === 'multiSelect';
  const needsRelatedDatabase = type === 'relation';
  const trimmedName = name.trim();

  useEffect(() => {
    if (type !== 'relation' || availableDatabases.length > 0 || loadingDatabases) return;
    setLoadingDatabases(true);
    getDatabases()
      .then(setAvailableDatabases)
      .catch(() => setError('تعذّر تحميل قواعد البيانات'))
      .finally(() => setLoadingDatabases(false));
  }, [type]);

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
    setSaving(true);
    setError('');
    try {
      const property = await addProperty(databaseId, {
        name: trimmedName,
        type,
        options: needsOptions ? options : undefined,
        relatedDatabaseId: needsRelatedDatabase ? relatedDatabaseId : undefined,
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

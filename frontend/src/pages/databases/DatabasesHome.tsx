import { useEffect, useRef, useState } from 'react';
import { getDatabases, createDatabase, deleteDatabase, DatabaseSummary } from '@/services/api';
import { DEFAULT_LIFE_AREA_COLOR } from '@/utils/lifeArea';
import { ColorPicker } from '@/components/common/ColorPicker';
import { IconGroups } from '@/pages/life-areas/LifeAreasManager';
import { DynamicIcon } from '@/utils/icons';
import { sounds } from '@/services/audio/sounds';
import { toast } from '@/utils/toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import BackButton from '@/components/layout/BackButton';

// ===== الصفحة الرئيسية لميزة "قواعد البيانات" (Databases) — المرحلة 1.
// فكرة مستوحاة من Notion Databases: كل قاعدة بيانات هنا هي جدول مرن
// المستخدم بيعرّف أعمدته (خصائصه) بنفسه، بدل شكل ثابت زي المهام العادية.
// الصفحة دي بس بتعرض قائمة قواعد البيانات (كروت) + إنشاء/حذف؛ فتح قاعدة
// معينة بيوديك لـ DatabaseView.tsx (عرض الجدول والتعديل عليه). =====
export default function DatabasesHome({
  onBack,
  onOpenMenu,
  menuOpen,
  onOpenDatabase,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onOpenDatabase: (id: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_LIFE_AREA_COLOR);
  const [icon, setIcon] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState<DatabaseSummary | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const fetched = await getDatabases();
      setDatabases(fetched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل قواعد البيانات');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setName('');
    setColor(DEFAULT_LIFE_AREA_COLOR);
    setIcon('');
    setError('');
    setCreateOpen(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  const trimmedName = name.trim();

  async function handleCreate() {
    if (!trimmedName) {
      setError('لازم تكتب اسم للقاعدة الأول');
      sounds.error();
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const db = await createDatabase({ name: trimmedName, color, icon: icon || null });
      sounds.addItem();
      toast.success(`اتضافت قاعدة "${trimmedName}"`);
      setDatabases((prev) => [...prev, db]);
      setCreateOpen(false);
      onOpenDatabase(db.id);
    } catch (err) {
      sounds.error();
      const message = err instanceof Error ? err.message : 'تعذّر إنشاء القاعدة';
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function confirmDeleteNow() {
    const db = confirmDelete;
    setConfirmDelete(null);
    if (!db) return;
    sounds.deleteItem();
    try {
      await deleteDatabase(db.id);
      setDatabases((prev) => prev.filter((d) => d.id !== db.id));
      toast.info(`اتحذفت قاعدة "${db.name}"`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف القاعدة');
    }
  }

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>قواعد البيانات</strong>
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

      <div className="life-area-toolbar">
        <button type="button" className="life-area-new-btn" onClick={openCreate}>
          <DynamicIcon name="plus" size={16} /> قاعدة بيانات جديدة
        </button>
      </div>

      {loading && (
        <div className="life-area-cards-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {!loading && databases.length === 0 && (
        <p className="empty">
          <DynamicIcon name="table" size={32} className="empty-icon" />
          لسه مفيش قواعد بيانات، ابدأ بإنشاء أول قاعدة من الزرار فوق
        </p>
      )}

      {!loading && databases.length > 0 && (
        <div className="life-area-cards-grid">
          {databases.map((db) => (
            <div key={db.id} className="life-area-card" style={{ ['--area-color' as any]: db.color }}>
              <div className="life-area-card-toolbar">
                <button
                  type="button"
                  className="icon-btn small danger"
                  onClick={() => setConfirmDelete(db)}
                  aria-label={`حذف قاعدة ${db.name}`}
                  title="حذف"
                >
                  <DynamicIcon name="trash-2" size={14} />
                </button>
              </div>
              <button type="button" className="life-area-card-main" onClick={() => onOpenDatabase(db.id)}>
                <span className="life-area-avatar" style={{ width: 48, height: 48, borderRadius: 15, background: db.color }}>
                  <DynamicIcon name={db.icon || 'table'} size={22} className="life-area-avatar-icon" />
                </span>
                <span className="life-area-card-main-text">
                  <strong>{db.name}</strong>
                  <span className="life-area-card-main-meta">
                    {db.properties.length > 0 ? `${db.properties.length} خاصية` : 'من غير خصائص لسه'}
                  </span>
                </span>
                <DynamicIcon name="chevron-left" size={16} className="life-area-card-chevron" />
              </button>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay add-task-overlay" onClick={() => setCreateOpen(false)}>
          <div
            className="modal-box add-task-modal quick-life-area-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-database-title"
          >
            <div className="add-task-header">
              <h2 id="quick-database-title">
                <span className="add-task-header-icon" style={{ background: color, color: '#fff' }}>
                  <DynamicIcon name={icon || 'table'} size={20} strokeWidth={2.25} />
                </span>
                <span className="add-task-header-text">
                  <span className="add-task-header-step">قاعدة بيانات جديدة</span>
                  <span className="add-task-header-title">إنشاء قاعدة</span>
                </span>
              </h2>
              <button className="icon-btn" onClick={() => setCreateOpen(false)} type="button" aria-label="إغلاق">
                <DynamicIcon name="x" size={16} />
              </button>
            </div>

            <div className="add-task-body quick-life-area-body">
              <div className="add-task-field">
                <label htmlFor="quick-database-name" className="add-task-label">
                  اسم القاعدة
                </label>
                <input
                  id="quick-database-name"
                  ref={nameRef}
                  className="add-task-title-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="مثال: كتبي، مصاريفي، أفلام شفتها"
                  maxLength={60}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'quick-database-error' : undefined}
                />
              </div>

              <div className="add-task-field">
                <span className="add-task-label">اللون</span>
                <ColorPicker value={color} onChange={setColor} />
              </div>

              <div className="add-task-field">
                <span className="add-task-label">الأيقونة (اختياري)</span>
                <IconGroups value={icon} onSelect={setIcon} />
              </div>

              {error && (
                <p className="wizard-step-error" role="alert" id="quick-database-error">
                  <DynamicIcon name="alert" size={13} /> {error}
                </p>
              )}
            </div>

            <div className="add-task-footer">
              <button className="small" type="button" onClick={() => setCreateOpen(false)} disabled={creating}>
                إلغاء
              </button>
              <button className="add-task-submit" type="button" onClick={handleCreate} disabled={creating || !trimmedName}>
                {creating ? 'جاري الإنشاء…' : 'إنشاء القاعدة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="حذف قاعدة البيانات؟"
          description={
            <>
              هيتم حذف قاعدة "<strong>{confirmDelete.name}</strong>" وكل صفوفها وخصائصها نهائيًا. الإجراء ده مينفعش يترجع.
            </>
          }
          confirmLabel="حذف القاعدة"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteNow}
        />
      )}
    </div>
  );
}

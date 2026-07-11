import { useEffect, useState } from 'react';
import {
  AdminUpdateEntry,
  UpdateFormData,
  UpdatesCursor,
  createAdminUpdate,
  deleteAdminUpdate,
  getAdminUpdates,
  getAdminUpdatesStats,
  togglePinAdminUpdate,
  togglePublishAdminUpdate,
  updateAdminUpdate,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import UpdateFormModal from './UpdateFormModal';

type StatusFilter = 'all' | 'published' | 'draft' | 'pinned';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'published', label: 'منشور' },
  { key: 'draft', label: 'مسودة' },
  { key: 'pinned', label: 'مثبّت' },
];

export default function AdminUpdatesManager() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [items, setItems] = useState<AdminUpdateEntry[]>([]);
  const [cursor, setCursor] = useState<UpdatesCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<{ total: number; published: number; draft: number; pinned: number } | null>(
    null
  );

  const [formOpen, setFormOpen] = useState<'new' | AdminUpdateEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUpdateEntry | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status]);

  async function load() {
    setLoading(true);
    try {
      const [page, s] = await Promise.all([
        getAdminUpdates({ q: query.trim(), status, limit: 25, cursor: null }),
        getAdminUpdatesStats(),
      ]);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
      setStats(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل التحديثات');
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getAdminUpdates({ q: query.trim(), status, limit: 25, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل المزيد');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmitForm(data: UpdateFormData) {
    if (formOpen === 'new') {
      await createAdminUpdate(data);
      sounds.success();
      toast.success('تم إنشاء التحديث');
    } else if (formOpen) {
      await updateAdminUpdate(formOpen.id, data);
      sounds.success();
      toast.success('تم حفظ التعديلات');
    }
    setFormOpen(null);
    await load();
  }

  async function handleTogglePin(u: AdminUpdateEntry) {
    try {
      await togglePinAdminUpdate(u.id);
      sounds.click();
      await load();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'فشلت العملية');
    }
  }

  async function handleTogglePublish(u: AdminUpdateEntry) {
    try {
      await togglePublishAdminUpdate(u.id);
      sounds.click();
      await load();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'فشلت العملية');
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !deletePassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminUpdate(deleteTarget.id, deletePassword);
      sounds.deleteItem();
      toast.success('تم حذف التحديث');
      setDeleteTarget(null);
      setDeletePassword('');
      await load();
    } catch (err) {
      sounds.error();
      setDeleteError(err instanceof Error ? err.message : 'فشل الحذف');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-updates-manager">
      <div className="admin-section-header">
        <h2>إدارة التحديثات</h2>
        <button className="small" onClick={() => setFormOpen('new')}>
          + تحديث جديد
        </button>
      </div>

      {stats && (
        <div className="updates-mini-stats">
          <span>الكل: {stats.total}</span>
          <span>منشور: {stats.published}</span>
          <span>مسودة: {stats.draft}</span>
          <span>مثبّت: {stats.pinned}</span>
        </div>
      )}

      <div className="updates-toolbar admin-updates-toolbar">
        <div className="updates-search">
          <span className="updates-search-icon">🔍</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالعنوان أو الإصدار" />
        </div>
        <div className="updates-filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`filter-pill ${status === f.key ? 'active' : ''}`}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="stats-grid">
          <div className="skeleton" style={{ height: 70 }} />
          <div className="skeleton" style={{ height: 70 }} />
        </div>
      )}

      {!loading && items.length === 0 && <p className="empty">مفيش تحديثات مطابقة</p>}

      {!loading && items.length > 0 && (
        <div className="admin-updates-list">
          {items.map((u) => (
            <div className="admin-update-row" key={u.id}>
              <span className="update-compact-emoji">{u.emoji}</span>
              <div className="admin-update-info">
                <strong>
                  {u.title}
                  {!u.isPublished && <span className="suspended-badge">مسودة</span>}
                  {u.pinned && <span className="admin-badge">مثبّت</span>}
                </strong>
                <span className="user-row-meta">
                  {u.version && `الإصدار ${u.version} · `}
                  {new Date(u.publishedAt).toLocaleDateString('ar-EG')} · بقلم {u.authorName} ·{' '}
                  {u.features.length} نقطة
                </span>
              </div>
              <div className="user-row-actions">
                <button className="small" onClick={() => setFormOpen(u)}>
                  تعديل
                </button>
                <button className="small" onClick={() => handleTogglePin(u)}>
                  {u.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
                </button>
                <button className="small" onClick={() => handleTogglePublish(u)}>
                  {u.isPublished ? 'إخفاء' : 'نشر'}
                </button>
                <button
                  className="danger small"
                  onClick={() => {
                    setDeleteTarget(u);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
          {hasMore && (
            <button className="small updates-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
            </button>
          )}
        </div>
      )}

      {formOpen && (
        <UpdateFormModal
          existing={formOpen === 'new' ? null : formOpen}
          onClose={() => setFormOpen(null)}
          onSubmit={handleSubmitForm}
        />
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تأكيد الحذف</h2>
            <p className="modal-text">
              أنت على وشك حذف التحديث <strong>"{deleteTarget.title}"</strong> نهائيًا.
            </p>
            <p className="modal-text modal-hint">اكتب كلمة مرورك انت (الأدمن) للتأكيد:</p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="كلمة مرور الأدمن"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
            />
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="modal-actions">
              <button className="small" onClick={() => setDeleteTarget(null)} type="button">
                إلغاء
              </button>
              <button
                className="danger small"
                onClick={handleDelete}
                disabled={!deletePassword || deleting}
                type="button"
              >
                {deleting ? 'جاري الحذف...' : 'تأكيد وحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


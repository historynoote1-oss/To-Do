import { useEffect, useState } from 'react';
import {
  AdminListEntry,
  AdminItemEntry,
  getAdminLists,
  updateAdminList,
  deleteAdminList,
  restoreAdminOverdueList,
  getAdminItems,
  updateAdminItem,
  deleteAdminItem,
  sendAdminNotification,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import AdminConfirmModal from './AdminConfirmModal';
import { DynamicIcon } from '../lib/icons';

const PRIORITY_LABELS: Record<string, string> = { NONE: 'غير محددة', LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'مرتفعة', CRITICAL: 'حرجة' };

export default function AdminContentPanel() {
  const [subTab, setSubTab] = useState<'lists' | 'items' | 'notifications'>('lists');

  return (
    <div className="admin-content-panel">
      <div className="admin-tabs admin-subtabs">
        <button type="button" className={`admin-tab ${subTab === 'lists' ? 'active' : ''}`} onClick={() => setSubTab('lists')}>
          <DynamicIcon name="clipboard-list" size={14} /> القوائم
        </button>
        <button type="button" className={`admin-tab ${subTab === 'items' ? 'active' : ''}`} onClick={() => setSubTab('items')}>
          <DynamicIcon name="check-circle" size={14} /> المهام
        </button>
        <button type="button" className={`admin-tab ${subTab === 'notifications' ? 'active' : ''}`} onClick={() => setSubTab('notifications')}>
          <DynamicIcon name="megaphone" size={14} /> الإشعارات
        </button>
      </div>
      {subTab === 'lists' ? <ListsManager /> : subTab === 'items' ? <ItemsManager /> : <NotificationsSender />}
    </div>
  );
}

// إرسال إشعار/رسالة من الأدمن لكل المستخدمين، أو لمستخدم معيّن لو حدد
// اسمه — بتظهر في جرس الإشعارات بتاع المستخدم المستهدف (شوف
// components/NotificationsBell.tsx وroutes/adminContent.ts).
function NotificationsSender() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [username, setUsername] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function runSend(adminPassword: string) {
    const result = await sendAdminNotification({
      title: title.trim(),
      body: body.trim(),
      username: username.trim() || undefined,
      adminPassword,
    });
    sounds.success();
    toast.success(`اتبعت الرسالة لـ ${result.count} مستخدم`);
    setConfirming(false);
    setTitle('');
    setBody('');
    setUsername('');
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2>إرسال إشعار</h2>
      </div>
      <p className="modal-hint" style={{ marginBottom: 12 }}>
        سيبك حقل "اسم المستخدم" فاضي عشان الرسالة توصل لكل المستخدمين، أو حدده عشان تبعتها لواحد بعينه.
      </p>

      <div className="admin-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الإشعار" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الرسالة" rows={4} />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم مستخدم معيّن (اختياري — سيبه فاضي للكل)" />
        <button
          className="small"
          type="button"
          disabled={!title.trim() || !body.trim()}
          onClick={() => setConfirming(true)}
        >
          إرسال
        </button>
      </div>

      {confirming && (
        <AdminConfirmModal
          title="تأكيد إرسال الإشعار"
          description={
            <p>
              أنت على وشك إرسال هذا الإشعار لـ <strong>{username.trim() || 'كل المستخدمين'}</strong>.
            </p>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={runSend}
        />
      )}
    </div>
  );
}

function ListsManager() {
  const [lists, setLists] = useState<AdminListEntry[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'overdue' | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminListEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleting, setDeleting] = useState<AdminListEntry | null>(null);
  const [restoring, setRestoring] = useState<AdminListEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(1, q, status);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  useEffect(() => {
    load(page, q, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load(p: number, query: string, statusFilter: typeof status) {
    setLoading(true);
    try {
      const data = await getAdminLists({ q: query, status: statusFilter, page: p, pageSize: 20 });
      setLists(data.lists);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل القوائم');
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await updateAdminList(editing.id, editTitle);
      sounds.success();
      setEditing(null);
      await load(page, q, status);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'فشل التعديل');
    }
  }

  async function runDelete(password: string) {
    if (!deleting) return;
    await deleteAdminList(deleting.id, password);
    sounds.deleteItem();
    setDeleting(null);
    await load(page, q, status);
  }

  async function runRestore(password: string) {
    if (!restoring) return;
    await restoreAdminOverdueList(restoring.id, password);
    sounds.success();
    toast.success(`اتسترجعت "${restoring.title}" — هتظهر لصاحبها في "بانتظار المراجعة" بالصفحة الرئيسية`);
    setRestoring(null);
    await load(page, q, status);
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2>كل القوائم ({total})</h2>
      </div>
      <div className="audit-log-filters">
        <input className="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بعنوان القائمة أو اسم صاحبها..." />
        <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">كل الحالات</option>
          <option value="active">نشطة</option>
          <option value="archived">مؤرشفة</option>
          <option value="overdue">متأخرة (تحتاج استرجاع)</option>
        </select>
      </div>

      <div className="users-table">
        {loading && <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />}
        {!loading && lists.length === 0 && <p className="empty">مفيش نتائج مطابقة</p>}
        {lists.map((l) => {
          const isOverdue = l.archiveReason === 'OVERDUE' && !!l.archivedAt;
          return (
            <div className="user-row" key={l.id}>
              <div className="user-row-info">
                <strong>
                  {l.title} {isOverdue && <span className="admin-badge admin-badge-danger">متأخرة</span>}
                </strong>
                <span className="user-row-meta">
                  صاحبها: {l.user.username} · {l._count.items} مهمة
                </span>
                <span className="user-row-meta">آخر تعديل: {new Date(l.updatedAt).toLocaleString('ar-EG')}</span>
              </div>
              <div className="user-row-actions">
                {isOverdue && (
                  <button className="small" onClick={() => setRestoring(l)}>
                    <DynamicIcon name="rotate-ccw" size={13} /> استرجاع
                  </button>
                )}
                <button
                  className="small"
                  onClick={() => {
                    setEditing(l);
                    setEditTitle(l.title);
                  }}
                >
                  تعديل العنوان
                </button>
                <button className="danger small" onClick={() => setDeleting(l)}>
                  حذف
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </button>
          <span className="pagination-label">
            صفحة {page} من {totalPages}
          </span>
          <button className="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </button>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تعديل عنوان القائمة</h2>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
            <div className="modal-actions">
              <button className="small" onClick={() => setEditing(null)} type="button">
                إلغاء
              </button>
              <button className="small" onClick={saveEdit} disabled={!editTitle.trim()} type="button">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <AdminConfirmModal
          title="تأكيد حذف القائمة"
          danger
          description={
            <p>
              أنت على وشك حذف القائمة <strong>"{deleting.title}"</strong> بتاعة <strong>{deleting.user.username}</strong> نهائيًا
              (وكل المهام اللي فيها).
            </p>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={runDelete}
        />
      )}

      {restoring && (
        <AdminConfirmModal
          title="تأكيد استرجاع المهمة المتأخرة"
          description={
            <p>
              المهمة <strong>"{restoring.title}"</strong> بتاعة <strong>{restoring.user.username}</strong> اتؤرشفت تلقائيًا لأنها
              فاتت معادها، وده إجراء المستخدم نفسه مايقدرش يتراجع عنه. هترجعها لقسم "بانتظار المراجعة" عند صاحبها عشان يراجعها
              ويأكّدها بنفسه.
            </p>
          }
          onCancel={() => setRestoring(null)}
          onConfirm={runRestore}
        />
      )}
    </div>
  );
}

function ItemsManager() {
  const [items, setItems] = useState<AdminItemEntry[]>([]);
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminItemEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [deleting, setDeleting] = useState<AdminItemEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, priority, status]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load(p: number) {
    setLoading(true);
    try {
      const data = await getAdminItems({ q, priority, status: status as any, page: p, pageSize: 20 });
      setItems(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل المهام');
    } finally {
      setLoading(false);
    }
  }

  async function toggleDone(item: AdminItemEntry) {
    try {
      await updateAdminItem(item.id, { isDone: !item.isDone });
      sounds.click();
      await load(page);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'فشل التعديل');
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await updateAdminItem(editing.id, { content: editContent, priority: editPriority });
      sounds.success();
      setEditing(null);
      await load(page);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'فشل التعديل');
    }
  }

  async function runDelete(password: string) {
    if (!deleting) return;
    await deleteAdminItem(deleting.id, password);
    sounds.deleteItem();
    setDeleting(null);
    await load(page);
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2>كل المهام ({total})</h2>
      </div>
      <div className="audit-log-filters">
        <input className="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في نص المهمة..." />
        <select className="admin-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">كل الأولويات</option>
          <option value="CRITICAL">حرجة</option>
          <option value="HIGH">مرتفعة</option>
          <option value="MEDIUM">متوسطة</option>
          <option value="LOW">منخفضة</option>
        </select>
        <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="done">مخلّصة</option>
          <option value="pending">لسه مخلّصتش</option>
        </select>
      </div>

      <div className="users-table">
        {loading && <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />}
        {!loading && items.length === 0 && <p className="empty">مفيش نتائج مطابقة</p>}
        {items.map((it) => (
          <div className="user-row" key={it.id}>
            <div className="user-row-info">
              <strong style={it.isDone ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>{it.content}</strong>
              <span className="user-row-meta">
                {it.list.user.username} · قائمة "{it.list.title}" · أولوية: {PRIORITY_LABELS[it.priority]}
              </span>
              <span className="user-row-meta">آخر تعديل: {new Date(it.updatedAt).toLocaleString('ar-EG')}</span>
            </div>
            <div className="user-row-actions">
              <button className="small" onClick={() => toggleDone(it)}>
                {it.isDone ? 'إرجاع لغير مخلّصة' : 'تعليم كمخلّصة'}
              </button>
              <button
                className="small"
                onClick={() => {
                  setEditing(it);
                  setEditContent(it.content);
                  setEditPriority(it.priority === 'NONE' ? 'MEDIUM' : it.priority);
                }}
              >
                تعديل
              </button>
              <button className="danger small" onClick={() => setDeleting(it)}>
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </button>
          <span className="pagination-label">
            صفحة {page} من {totalPages}
          </span>
          <button className="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </button>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تعديل المهمة</h2>
            <input value={editContent} onChange={(e) => setEditContent(e.target.value)} autoFocus />
            <select className="admin-select" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ marginTop: 10 }}>
              <option value="CRITICAL">حرجة</option>
              <option value="HIGH">مرتفعة</option>
              <option value="MEDIUM">متوسطة</option>
              <option value="LOW">منخفضة</option>
            </select>
            <div className="modal-actions">
              <button className="small" onClick={() => setEditing(null)} type="button">
                إلغاء
              </button>
              <button className="small" onClick={saveEdit} disabled={!editContent.trim()} type="button">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <AdminConfirmModal
          title="تأكيد حذف المهمة"
          danger
          description={
            <p>
              أنت على وشك حذف المهمة <strong>"{deleting.content}"</strong> نهائيًا.
            </p>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={runDelete}
        />
      )}
    </div>
  );
}

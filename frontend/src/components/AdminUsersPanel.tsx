import { useEffect, useState } from 'react';
import {
  AdminUserEntry,
  LogEntry,
  getAdminUsers,
  deleteAdminUser,
  suspendAdminUser,
  forceLogoutAdminUser,
  resetAdminUserPassword,
  unlockAdminUser,
  updateAdminUser,
  getAdminAuditLog,
  downloadAdminUsersCsv,
  downloadAdminAuditLogCsv,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import AdminConfirmModal from './AdminConfirmModal';

type ActionType = 'suspend' | 'delete' | 'forceLogout' | 'resetPassword' | 'unlock';

interface PendingAction {
  type: ActionType;
  id: string;
  username: string;
}

const ACTION_LABELS: Record<ActionType, string> = {
  suspend: 'تعليق/تفعيل الحساب',
  delete: 'حذف الحساب نهائيًا',
  forceLogout: 'تسجيل خروج إجباري',
  resetPassword: 'إعادة تعيين كلمة المرور',
  unlock: 'فك قفل الحساب',
};

function isLocked(u: AdminUserEntry) {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [exportingUsers, setExportingUsers] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logAdminFilter, setLogAdminFilter] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [editing, setEditing] = useState<AdminUserEntry | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setUserPage(1);
      loadUsers(1, userQuery);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userQuery]);

  useEffect(() => {
    loadUsers(userPage, userQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPage]);

  useEffect(() => {
    if (showLogs) loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLogs, logAdminFilter, logActionFilter]);

  useEffect(() => {
    if (showLogs) loadLogs(logPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logPage]);

  async function loadUsers(page: number, q: string) {
    setUsersLoading(true);
    try {
      const data = await getAdminUsers({ q, page, pageSize: 20 });
      setUsers(data.users);
      setUserTotalPages(data.totalPages);
      setUserTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل المستخدمين');
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadLogs(page: number) {
    setLogsLoading(true);
    try {
      const data = await getAdminAuditLog({
        page,
        pageSize: 50,
        adminUsername: logAdminFilter || undefined,
        action: logActionFilter || undefined,
      });
      setLogs(data.logs);
      setLogTotalPages(data.totalPages);
      setLogTotal(data.total);
      setAvailableActions(data.availableActions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل سجل العمليات');
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleExportUsers() {
    setExportingUsers(true);
    try {
      const blob = await downloadAdminUsersCsv(userQuery || undefined);
      downloadBlob(blob, `users-${Date.now()}.csv`);
      sounds.success();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر التصدير');
    } finally {
      setExportingUsers(false);
    }
  }

  async function handleExportLogs() {
    setExportingLogs(true);
    try {
      const blob = await downloadAdminAuditLogCsv({
        adminUsername: logAdminFilter || undefined,
        action: logActionFilter || undefined,
      });
      downloadBlob(blob, `audit-log-${Date.now()}.csv`);
      sounds.success();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر التصدير');
    } finally {
      setExportingLogs(false);
    }
  }

  function openEdit(u: AdminUserEntry) {
    setEditing(u);
    setEditUsername(u.username);
    setEditIsAdmin(u.isAdmin);
  }

  async function refreshAfterAction() {
    await loadUsers(userPage, userQuery);
    if (showLogs) await loadLogs(logPage);
  }

  async function runAction(password: string) {
    if (!pending) return;
    switch (pending.type) {
      case 'delete':
        await deleteAdminUser(pending.id, password);
        sounds.deleteItem();
        break;
      case 'suspend':
        await suspendAdminUser(pending.id, password);
        sounds.click();
        break;
      case 'forceLogout':
        await forceLogoutAdminUser(pending.id, password);
        sounds.click();
        break;
      case 'unlock':
        await unlockAdminUser(pending.id, password);
        sounds.click();
        break;
      case 'resetPassword': {
        const { tempPassword } = await resetAdminUserPassword(pending.id, password);
        sounds.success();
        alert(
          `كلمة المرور المؤقتة لـ "${pending.username}" هي:\n\n${tempPassword}\n\nابعتها له يدويًا دلوقتي — مش هتظهر تاني بعد ما تقفل الرسالة دي.`
        );
        break;
      }
    }
    setPending(null);
    await refreshAfterAction();
  }

  async function runEdit(password: string) {
    if (!editing) return;
    await updateAdminUser(editing.id, { username: editUsername, isAdmin: editIsAdmin }, password);
    sounds.success();
    setEditing(null);
    await refreshAfterAction();
  }

  return (
    <div className="admin-users-panel">
      <div className="admin-section-header">
        <h2>كل المستخدمين ({userTotal})</h2>
        <div className="admin-section-actions">
          <button className="small" onClick={handleExportUsers} disabled={exportingUsers}>
            {exportingUsers ? 'جاري التصدير...' : '⬇️ تصدير CSV'}
          </button>
          <button className="small" onClick={() => setShowLogs((v) => !v)}>
            سجل عمليات الأدمن
          </button>
        </div>
      </div>

      <input
        className="admin-search"
        value={userQuery}
        onChange={(e) => setUserQuery(e.target.value)}
        placeholder="ابحث باسم المستخدم..."
      />

      <div className="users-table">
        {usersLoading && <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />}
        {!usersLoading && users.length === 0 && <p className="empty">مفيش نتائج مطابقة</p>}
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div className="user-row-info">
              <strong>
                {u.username} {!u.isActive && <span className="suspended-badge">متعلّق</span>}
                {isLocked(u) && <span className="suspended-badge">مقفول مؤقتًا</span>}
              </strong>
              {u.isAdmin && <span className="admin-badge">أدمن</span>}
              {u.mustRehabilitate && (
                <span className="suspended-badge" title="لسه محتاج يعمل إعادة تأهيل عشان يقدر يستخدم الموقع">
                  محتاج إعادة تأهيل
                </span>
              )}
              {u.legacyAccount && !u.mustRehabilitate && (
                <span className="user-row-meta" title="اتسجّل أصلًا بالنظام القديم وخلّص إعادة التأهيل">
                  ✅ حساب قديم اتأهّل
                </span>
              )}
              <span className="user-row-meta">
                {u._count.lists} قائمة · انضم {new Date(u.createdAt).toLocaleDateString('ar-EG')}
              </span>
              <span className="user-row-meta">
                آخر دخول:{' '}
                {u.lastLoginAt
                  ? `${new Date(u.lastLoginAt).toLocaleString('ar-EG')} (${u.lastLoginIp || 'غير معروف'})`
                  : 'لسه ماسجلش دخول'}
              </span>
              {u.lastLoginUserAgent && <span className="user-row-meta">الجهاز: {u.lastLoginUserAgent}</span>}
              {u.failedLoginAttempts > 0 && !isLocked(u) && (
                <span className="user-row-meta" style={{ color: 'var(--accent)' }}>
                  {u.failedLoginAttempts} محاولة دخول فاشلة مؤخرًا
                </span>
              )}
              {isLocked(u) && (
                <span className="user-row-meta" style={{ color: 'var(--danger)' }}>
                  مقفول لحد {new Date(u.lockedUntil!).toLocaleString('ar-EG')} بسبب محاولات فاشلة كتيرة
                </span>
              )}
            </div>
            <div className="user-row-actions">
              <button className="small" onClick={() => openEdit(u)}>
                تعديل
              </button>
              {!u.isAdmin && (
                <>
                  {isLocked(u) && (
                    <button className="small" onClick={() => setPending({ type: 'unlock', id: u.id, username: u.username })}>
                      فك القفل
                    </button>
                  )}
                  <button className="small" onClick={() => setPending({ type: 'resetPassword', id: u.id, username: u.username })}>
                    إعادة تعيين الباسورد
                  </button>
                  <button className="small" onClick={() => setPending({ type: 'forceLogout', id: u.id, username: u.username })}>
                    خروج إجباري
                  </button>
                  <button className="small" onClick={() => setPending({ type: 'suspend', id: u.id, username: u.username })}>
                    {u.isActive ? 'تعليق' : 'تفعيل'}
                  </button>
                  <button className="danger small" onClick={() => setPending({ type: 'delete', id: u.id, username: u.username })}>
                    حذف
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {userTotalPages > 1 && (
        <div className="pagination">
          <button className="small" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>
            السابق
          </button>
          <span className="pagination-label">
            صفحة {userPage} من {userTotalPages}
          </span>
          <button className="small" disabled={userPage >= userTotalPages} onClick={() => setUserPage((p) => p + 1)}>
            التالي
          </button>
        </div>
      )}

      {showLogs && (
        <div className="audit-log">
          <div className="admin-section-header">
            <h2>سجل عمليات الأدمن ({logTotal})</h2>
            <button className="small" onClick={handleExportLogs} disabled={exportingLogs}>
              {exportingLogs ? 'جاري التصدير...' : '⬇️ تصدير CSV'}
            </button>
          </div>

          <div className="audit-log-filters">
            <input
              className="admin-search"
              value={logAdminFilter}
              onChange={(e) => setLogAdminFilter(e.target.value)}
              placeholder="فلترة باسم الأدمن..."
            />
            <select className="admin-select" value={logActionFilter} onChange={(e) => setLogActionFilter(e.target.value)}>
              <option value="">كل أنواع العمليات</option>
              {availableActions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {logsLoading && <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />}
          {!logsLoading && logs.length === 0 && <p className="empty">مفيش عمليات مطابقة</p>}
          {logs.map((l) => (
            <div className="log-row" key={l.id}>
              <span>
                <strong>{l.adminUsername}</strong> — {l.action}
                {l.targetUsername && ` — ${l.targetUsername}`}
              </span>
              <span className="user-row-meta">
                {new Date(l.createdAt).toLocaleString('ar-EG')}
                {l.ip && ` · IP: ${l.ip}`}
              </span>
            </div>
          ))}

          {logTotalPages > 1 && (
            <div className="pagination">
              <button className="small" disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}>
                السابق
              </button>
              <span className="pagination-label">
                صفحة {logPage} من {logTotalPages}
              </span>
              <button className="small" disabled={logPage >= logTotalPages} onClick={() => setLogPage((p) => p + 1)}>
                التالي
              </button>
            </div>
          )}
        </div>
      )}

      {pending && (
        <AdminConfirmModal
          title="تأكيد الإجراء"
          danger={pending.type === 'delete'}
          description={
            <p>
              أنت على وشك تنفيذ <strong>{ACTION_LABELS[pending.type]}</strong> لحساب <strong>"{pending.username}"</strong>.
            </p>
          }
          onCancel={() => setPending(null)}
          onConfirm={runAction}
        />
      )}

      {editing && (
        <AdminConfirmModal
          title={`تعديل حساب "${editing.username}"`}
          description={
            <div className="edit-user-fields">
              <label>
                اسم المستخدم
                <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                />
                صلاحية أدمن
              </label>
            </div>
          }
          onCancel={() => setEditing(null)}
          onConfirm={runEdit}
        />
      )}
    </div>
  );
}

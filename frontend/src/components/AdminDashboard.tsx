import { useEffect, useState } from 'react';
import {
  getAdminStats,
  getAdminUsers,
  deleteAdminUser,
  suspendAdminUser,
  forceLogoutAdminUser,
  resetAdminUserPassword,
  unlockAdminUser,
  getAdminAuditLog,
} from '../lib/api';
import { sounds } from '../lib/sounds';

interface Stats {
  usersCount: number;
  listsCount: number;
  itemsCount: number;
  doneItemsCount: number;
  activeCount: number;
  lockedCount: number;
  adminCount: number;
}

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  _count: { lists: number };
}

interface LogEntry {
  id: string;
  adminUsername: string;
  targetUsername: string | null;
  action: string;
  ip: string | null;
  createdAt: string;
}

type ActionType = 'suspend' | 'delete' | 'forceLogout' | 'resetPassword' | 'unlock';

interface PendingAction {
  type: ActionType;
  id: string;
  username: string;
  currentlyActive?: boolean;
}

const ACTION_LABELS: Record<ActionType, string> = {
  suspend: 'تعليق/تفعيل الحساب',
  delete: 'حذف الحساب نهائيًا',
  forceLogout: 'تسجيل خروج إجباري',
  resetPassword: 'إعادة تعيين كلمة المرور',
  unlock: 'فك قفل الحساب',
};

function isLocked(u: AdminUser) {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

const STAT_ICONS = ['👤', '✅', '📋', '🗂️', '🛡️', '🔒'];

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([getAdminStats(), getAdminUsers()]);
      setStats(s);
      setUsers(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    const data = await getAdminAuditLog();
    setLogs(data);
    setShowLogs(true);
  }

  function openConfirm(action: PendingAction) {
    setPending(action);
    setConfirmPassword('');
    setConfirmError(null);
  }

  function closeConfirm() {
    setPending(null);
    setConfirmPassword('');
    setConfirmError(null);
  }

  async function handleConfirm() {
    if (!pending || !confirmPassword) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      switch (pending.type) {
        case 'delete':
          await deleteAdminUser(pending.id, confirmPassword);
          sounds.deleteItem();
          break;
        case 'suspend':
          await suspendAdminUser(pending.id, confirmPassword);
          sounds.click();
          break;
        case 'forceLogout':
          await forceLogoutAdminUser(pending.id, confirmPassword);
          sounds.click();
          break;
        case 'unlock':
          await unlockAdminUser(pending.id, confirmPassword);
          sounds.click();
          break;
        case 'resetPassword': {
          const { tempPassword } = await resetAdminUserPassword(pending.id, confirmPassword);
          sounds.success();
          alert(
            `كلمة المرور المؤقتة لـ "${pending.username}" هي:\n\n${tempPassword}\n\nابعتها له يدويًا دلوقتي — مش هتظهر تاني بعد ما تقفل الرسالة دي.`
          );
          break;
        }
      }
      closeConfirm();
      await load();
    } catch (err) {
      sounds.error();
      setConfirmError(err instanceof Error ? err.message : 'فشلت العملية');
    } finally {
      setConfirmLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container admin-container">
        <div className="top-bar">
          <h1>لوحة تحكم الأدمن</h1>
        </div>
        <div className="stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 92 }} />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <div className="container error">⚠️ {error}</div>;

  return (
    <div className="container admin-container">
      <div className="top-bar">
        <h1>لوحة تحكم الأدمن</h1>
        <button className="small" onClick={onBack}>
          رجوع
        </button>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[0]}</span>
            <span className="stat-value">{stats.usersCount}</span>
            <span className="stat-label">مستخدم</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[1]}</span>
            <span className="stat-value">{stats.activeCount}</span>
            <span className="stat-label">حساب مفعّل</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[2]}</span>
            <span className="stat-value">{stats.listsCount}</span>
            <span className="stat-label">قائمة</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[3]}</span>
            <span className="stat-value">{stats.itemsCount}</span>
            <span className="stat-label">مهمة</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[4]}</span>
            <span className="stat-value">{stats.adminCount}</span>
            <span className="stat-label">أدمن</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">{STAT_ICONS[5]}</span>
            <span className="stat-value" style={stats.lockedCount > 0 ? { color: 'var(--danger)' } : undefined}>
              {stats.lockedCount}
            </span>
            <span className="stat-label">حساب مقفول حاليًا</span>
          </div>
        </div>
      )}

      <div className="admin-section-header">
        <h2>كل المستخدمين</h2>
        <button className="small" onClick={loadLogs}>
          سجل عمليات الأدمن
        </button>
      </div>

      <div className="users-table">
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div className="user-row-info">
              <strong>
                {u.username} {!u.isActive && <span className="suspended-badge">متعلّق</span>}
                {isLocked(u) && <span className="suspended-badge">مقفول مؤقتًا</span>}
              </strong>
              {u.isAdmin && <span className="admin-badge">أدمن</span>}
              <span className="user-row-meta">
                {u._count.lists} قائمة · انضم {new Date(u.createdAt).toLocaleDateString('ar-EG')}
              </span>
              <span className="user-row-meta">
                آخر دخول:{' '}
                {u.lastLoginAt
                  ? `${new Date(u.lastLoginAt).toLocaleString('ar-EG')} (${u.lastLoginIp || 'غير معروف'})`
                  : 'لسه ماسجلش دخول'}
              </span>
              {u.lastLoginUserAgent && (
                <span className="user-row-meta">الجهاز: {u.lastLoginUserAgent}</span>
              )}
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
            {!u.isAdmin && (
              <div className="user-row-actions">
                {isLocked(u) && (
                  <button
                    className="small"
                    onClick={() => openConfirm({ type: 'unlock', id: u.id, username: u.username })}
                  >
                    فك القفل
                  </button>
                )}
                <button
                  className="small"
                  onClick={() => openConfirm({ type: 'resetPassword', id: u.id, username: u.username })}
                >
                  إعادة تعيين الباسورد
                </button>
                <button
                  className="small"
                  onClick={() => openConfirm({ type: 'forceLogout', id: u.id, username: u.username })}
                >
                  خروج إجباري
                </button>
                <button
                  className="small"
                  onClick={() =>
                    openConfirm({
                      type: 'suspend',
                      id: u.id,
                      username: u.username,
                      currentlyActive: u.isActive,
                    })
                  }
                >
                  {u.isActive ? 'تعليق' : 'تفعيل'}
                </button>
                <button
                  className="danger small"
                  onClick={() => openConfirm({ type: 'delete', id: u.id, username: u.username })}
                >
                  حذف
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showLogs && (
        <div className="audit-log">
          <h2>آخر 100 عملية أدمن</h2>
          {logs.length === 0 && <p className="empty">مفيش عمليات مسجّلة لسه</p>}
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
        </div>
      )}

      {pending && (
        <div className="modal-overlay" onClick={closeConfirm}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تأكيد الإجراء</h2>
            <p className="modal-text">
              أنت على وشك تنفيذ <strong>{ACTION_LABELS[pending.type]}</strong> لحساب{' '}
              <strong>"{pending.username}"</strong>.
            </p>
            <p className="modal-text modal-hint">اكتب كلمة مرورك انت (الأدمن) للتأكيد:</p>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="كلمة مرور الأدمن"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
            {confirmError && <p className="error">{confirmError}</p>}
            <div className="modal-actions">
              <button className="small" onClick={closeConfirm} type="button">
                إلغاء
              </button>
              <button
                className="danger small"
                onClick={handleConfirm}
                disabled={!confirmPassword || confirmLoading}
                type="button"
              >
                {confirmLoading ? 'جاري التنفيذ...' : 'تأكيد وتنفيذ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

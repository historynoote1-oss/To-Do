import { useEffect, useState } from 'react';
import {
  getAdminStats,
  getAdminUsers,
  deleteAdminUser,
  suspendAdminUser,
  forceLogoutAdminUser,
  resetAdminUserPassword,
  getAdminAuditLog,
} from '../lib/api';
import { sounds } from '../lib/sounds';

interface Stats {
  usersCount: number;
  listsCount: number;
  itemsCount: number;
  doneItemsCount: number;
  activeCount: number;
}

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  _count: { lists: number };
}

interface LogEntry {
  id: string;
  adminUsername: string;
  targetUsername: string | null;
  action: string;
  createdAt: string;
}

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function handleDelete(id: string, username: string) {
    if (!confirm(`متأكد إنك عايز تحذف حساب "${username}"؟ الإجراء ده نهائي.`)) return;
    try {
      await deleteAdminUser(id);
      sounds.deleteItem();
      await load();
    } catch (err) {
      sounds.error();
      alert(err instanceof Error ? err.message : 'فشل الحذف');
    }
  }

  async function handleSuspend(id: string, username: string, currentlyActive: boolean) {
    const verb = currentlyActive ? 'تعليق' : 'إعادة تفعيل';
    if (!confirm(`متأكد إنك عايز تعمل ${verb} لحساب "${username}"؟`)) return;
    try {
      await suspendAdminUser(id);
      sounds.click();
      await load();
    } catch (err) {
      sounds.error();
      alert(err instanceof Error ? err.message : 'فشلت العملية');
    }
  }

  async function handleForceLogout(id: string, username: string) {
    if (!confirm(`هيتم تسجيل خروج "${username}" من كل الأجهزة فورًا. تكمل؟`)) return;
    try {
      await forceLogoutAdminUser(id);
      sounds.click();
      alert('تم تسجيل الخروج الإجباري.');
    } catch (err) {
      sounds.error();
      alert(err instanceof Error ? err.message : 'فشلت العملية');
    }
  }

  async function handleResetPassword(id: string, username: string) {
    if (
      !confirm(
        `هيتم إلغاء كلمة المرور القديمة لـ "${username}" وتوليد كلمة مرور مؤقتة جديدة. تكمل؟`
      )
    )
      return;
    try {
      const { tempPassword } = await resetAdminUserPassword(id);
      sounds.success();
      alert(
        `كلمة المرور المؤقتة لـ "${username}" هي:\n\n${tempPassword}\n\nابعتها له يدويًا دلوقتي — مش هتظهر تاني بعد ما تقفل الرسالة دي.`
      );
    } catch (err) {
      sounds.error();
      alert(err instanceof Error ? err.message : 'فشلت العملية');
    }
  }

  if (loading) return <div className="container">جاري تحميل لوحة التحكم...</div>;
  if (error) return <div className="container error">{error}</div>;

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
            <span className="stat-value">{stats.usersCount}</span>
            <span className="stat-label">مستخدم</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.activeCount}</span>
            <span className="stat-label">حساب مفعّل</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.listsCount}</span>
            <span className="stat-label">قائمة</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.itemsCount}</span>
            <span className="stat-label">مهمة</span>
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
            </div>
            {!u.isAdmin && (
              <div className="user-row-actions">
                <button className="small" onClick={() => handleResetPassword(u.id, u.username)}>
                  إعادة تعيين الباسورد
                </button>
                <button className="small" onClick={() => handleForceLogout(u.id, u.username)}>
                  خروج إجباري
                </button>
                <button
                  className="small"
                  onClick={() => handleSuspend(u.id, u.username, u.isActive)}
                >
                  {u.isActive ? 'تعليق' : 'تفعيل'}
                </button>
                <button className="danger small" onClick={() => handleDelete(u.id, u.username)}>
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
              <span className="user-row-meta">{new Date(l.createdAt).toLocaleString('ar-EG')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

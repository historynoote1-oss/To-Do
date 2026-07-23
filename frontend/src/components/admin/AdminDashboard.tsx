import AdminOverview from '@/components/admin/AdminOverview';
import AdminAnalytics from '@/components/admin/AdminAnalytics';
import AdminUsersPanel from '@/components/admin/AdminUsersPanel';
import AdminContentPanel from '@/components/admin/AdminContentPanel';
import AdminSettingsPanel from '@/components/admin/AdminSettingsPanel';
import TwoFactorSettings from '@/components/auth/TwoFactorSettings';
import { DynamicIcon, IconKey } from '@/lib/core/icons';
import BackButton from '@/components/layout/BackButton';

export type AdminTab = 'overview' | 'analytics' | 'users' | 'content' | 'settings' | 'security';

const NAV: { key: AdminTab; label: string; icon: IconKey }[] = [
  { key: 'overview', label: 'نظرة عامة', icon: 'home' },
  { key: 'analytics', label: 'التحليلات', icon: 'bar-chart' },
  { key: 'users', label: 'المستخدمين', icon: 'users' },
  { key: 'content', label: 'المحتوى', icon: 'folder-open' },
  { key: 'settings', label: 'الإعدادات', icon: 'settings' },
  { key: 'security', label: 'الأمان', icon: 'shield-check' },
];

// التبويب بقى "مُتحكَّم فيه" من App (controlled) بدل ما يكون state داخلي —
// كده الرابط في المتصفح بيتغيّر فعليًا مع كل تبويب (/admin/analytics،
// /admin/users...) وزرار رجوع المتصفح بيرجّع نفس التبويب اللي كنت فيه.
export default function AdminDashboard({
  onBack,
  tab,
  onTabChange,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const activeLabel = NAV.find((n) => n.key === tab)?.label || '';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h1>لوحة التحكم</h1>
          <div className="admin-sidebar-header-actions">
            <BackButton onClick={onBack} />
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
        <nav className="admin-sidebar-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`admin-nav-item ${tab === n.key ? 'active' : ''}`}
              onClick={() => onTabChange(n.key)}
            >
              <span className="admin-nav-icon"><DynamicIcon name={n.icon} size={16} /></span>
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <BackButton onClick={onBack} className="admin-topbar-back" />
          <strong className="admin-topbar-title">{activeLabel}</strong>
          <button
            className="icon-btn hamburger-btn admin-topbar-spacer"
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

        <nav className="admin-tabbar">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`admin-tab ${tab === n.key ? 'active' : ''}`}
              onClick={() => onTabChange(n.key)}
            >
              <span className="admin-tab-icon"><DynamicIcon name={n.icon} size={16} /></span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="admin-main-content">
          {tab === 'overview' && <AdminOverview />}
          {tab === 'analytics' && <AdminAnalytics />}
          {tab === 'users' && <AdminUsersPanel />}
          {tab === 'content' && <AdminContentPanel />}
          {tab === 'settings' && <AdminSettingsPanel />}
          {tab === 'security' && <TwoFactorSettings />}
        </div>
      </div>
    </div>
  );
}

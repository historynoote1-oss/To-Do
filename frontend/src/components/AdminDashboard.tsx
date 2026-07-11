import { useState } from 'react';
import AdminOverview from './AdminOverview';
import AdminAnalytics from './AdminAnalytics';
import AdminUsersPanel from './AdminUsersPanel';
import AdminContentPanel from './AdminContentPanel';
import AdminSettingsPanel from './AdminSettingsPanel';
import TwoFactorSettings from './TwoFactorSettings';

type Tab = 'overview' | 'analytics' | 'users' | 'content' | 'settings' | 'security';

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'نظرة عامة', icon: '🏠' },
  { key: 'analytics', label: 'التحليلات', icon: '📊' },
  { key: 'users', label: 'المستخدمين', icon: '👥' },
  { key: 'content', label: 'المحتوى', icon: '🗂️' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙️' },
  { key: 'security', label: 'الأمان', icon: '🔐' },
];

export default function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');

  const activeLabel = NAV.find((n) => n.key === tab)?.label || '';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h1>لوحة التحكم</h1>
          <button className="small" onClick={onBack}>
            رجوع
          </button>
        </div>
        <nav className="admin-sidebar-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`admin-nav-item ${tab === n.key ? 'active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <span className="admin-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <button className="small admin-topbar-back" onClick={onBack} aria-label="رجوع">
            رجوع
          </button>
          <strong className="admin-topbar-title">{activeLabel}</strong>
          <span className="admin-topbar-spacer" aria-hidden="true" />
        </div>

        <nav className="admin-tabbar">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`admin-tab ${tab === n.key ? 'active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <span className="admin-tab-icon">{n.icon}</span>
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

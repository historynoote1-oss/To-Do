import { useState } from 'react';
import AdminOverview from './AdminOverview';
import AdminAnalytics from './AdminAnalytics';
import AdminUsersPanel from './AdminUsersPanel';
import AdminContentPanel from './AdminContentPanel';
import AdminSettingsPanel from './AdminSettingsPanel';
import TwoFactorSettings from './TwoFactorSettings';
import { DynamicIcon, IconKey } from '../lib/icons';

type Tab = 'overview' | 'analytics' | 'users' | 'content' | 'settings' | 'security';

const NAV: { key: Tab; label: string; icon: IconKey }[] = [
  { key: 'overview', label: 'نظرة عامة', icon: 'home' },
  { key: 'analytics', label: 'التحليلات', icon: 'bar-chart' },
  { key: 'users', label: 'المستخدمين', icon: 'users' },
  { key: 'content', label: 'المحتوى', icon: 'folder-open' },
  { key: 'settings', label: 'الإعدادات', icon: 'settings' },
  { key: 'security', label: 'الأمان', icon: 'shield-check' },
];

export default function AdminDashboard({
  onBack,
  initialTab,
}: {
  onBack: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab || 'overview');

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
              <span className="admin-nav-icon"><DynamicIcon name={n.icon} size={16} /></span>
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

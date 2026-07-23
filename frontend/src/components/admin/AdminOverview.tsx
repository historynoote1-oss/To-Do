import { useEffect, useState } from 'react';
import { getAdminStats, getAdminGrowthStats, getAdminDistribution, AdminDistribution } from '@/lib/api/api';
import { toast } from '@/lib/core/toast';
import { DynamicIcon, IconKey } from '@/lib/core/icons';

interface Stats {
  usersCount: number;
  listsCount: number;
  itemsCount: number;
  doneItemsCount: number;
  activeCount: number;
  lockedCount: number;
  adminCount: number;
}

const STAT_ICONS: IconKey[] = ['users', 'check-circle', 'clipboard-list', 'folder-open', 'shield', 'lock'];

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [growth, setGrowth] = useState<{ date: string; count: number }[]>([]);
  const [dist, setDist] = useState<AdminDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, g, d] = await Promise.all([getAdminStats(), getAdminGrowthStats(), getAdminDistribution()]);
        setStats(s);
        setGrowth(g.days);
        setDist(d);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تعذّر تحميل النظرة العامة');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="stats-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 92 }} />
        ))}
      </div>
    );
  }

  const maxGrowth = Math.max(1, ...growth.map((d) => d.count));

  return (
    <div className="admin-overview">
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[0]} size={18} /></span>
            <div>
              <span className="stat-value">{stats.usersCount}</span>
              <span className="stat-label">مستخدم</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[1]} size={18} /></span>
            <div>
              <span className="stat-value">{stats.activeCount}</span>
              <span className="stat-label">حساب مفعّل</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[2]} size={18} /></span>
            <div>
              <span className="stat-value">{stats.listsCount}</span>
              <span className="stat-label">قائمة</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[3]} size={18} /></span>
            <div>
              <span className="stat-value">{stats.itemsCount}</span>
              <span className="stat-label">مهمة</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[4]} size={18} /></span>
            <div>
              <span className="stat-value">{stats.adminCount}</span>
              <span className="stat-label">أدمن</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name={STAT_ICONS[5]} size={18} /></span>
            <div>
              <span className="stat-value" style={stats.lockedCount > 0 ? { color: 'var(--danger)' } : undefined}>
                {stats.lockedCount}
              </span>
              <span className="stat-label">حساب مقفول حاليًا</span>
            </div>
          </div>
        </div>
      )}

      {dist && (
        <div className="stats-grid" style={{ marginTop: 14 }}>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name="trending-up" size={18} /></span>
            <div>
              <span className="stat-value">{dist.completionRate}%</span>
              <span className="stat-label">نسبة إنجاز المهام</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name="bar-chart" size={18} /></span>
            <div>
              <span className="stat-value">{dist.avgItemsPerList}</span>
              <span className="stat-label">متوسط مهام/قائمة</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name="folder" size={18} /></span>
            <div>
              <span className="stat-value">{dist.avgListsPerUser}</span>
              <span className="stat-label">متوسط قوائم/مستخدم</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon"><DynamicIcon name="trash" size={18} /></span>
            <div>
              <span className="stat-value">{dist.emptyLists}</span>
              <span className="stat-label">قائمة فاضية</span>
            </div>
          </div>
        </div>
      )}

      {growth.length > 0 && (
        <div className="growth-chart">
          <h2>تسجيلات جديدة (آخر 30 يوم)</h2>
          <div className="growth-chart-bars">
            {growth.map((d) => (
              <div className="growth-bar-wrap" key={d.date} title={`${d.date}: ${d.count}`}>
                <div
                  className="growth-bar"
                  style={{ height: `${Math.max((d.count / maxGrowth) * 100, d.count > 0 ? 6 : 2)}%` }}
                />
              </div>
            ))}
          </div>
          <p className="modal-hint" style={{ marginTop: 8 }}>
            لتحليلات أعمق وأمداء زمنية أطول (3 شهور / سنة) روح لتبويب "التحليلات".
          </p>
        </div>
      )}
    </div>
  );
}

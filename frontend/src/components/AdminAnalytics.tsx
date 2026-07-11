import { useEffect, useState } from 'react';
import {
  AnalyticsRange,
  AdminTimeseries,
  AdminDistribution,
  AdminTopUser,
  getAdminTimeseries,
  getAdminDistribution,
  getAdminTopUsers,
} from '../lib/api';
import { toast } from '../lib/toast';

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: '7d', label: 'أسبوع' },
  { key: '30d', label: 'شهر' },
  { key: '90d', label: '3 شهور' },
  { key: '365d', label: 'سنة' },
];

const PRIORITY_LABELS: Record<string, string> = { NONE: 'بدون', LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية' };
const PRIORITY_COLORS: Record<string, string> = {
  NONE: '#6b7280',
  LOW: '#3b82f6',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
};

function MiniBarChart({ title, points, color }: { title: string; points: { date: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="growth-chart">
      <h2>{title}</h2>
      <div className="growth-chart-bars">
        {points.map((p) => (
          <div className="growth-bar-wrap" key={p.date} title={`${p.date}: ${p.count}`}>
            <div
              className="growth-bar"
              style={{
                height: `${Math.max((p.count / max) * 100, p.count > 0 ? 6 : 2)}%`,
                background: color,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [series, setSeries] = useState<AdminTimeseries | null>(null);
  const [dist, setDist] = useState<AdminDistribution | null>(null);
  const [topUsers, setTopUsers] = useState<AdminTopUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, d, t] = await Promise.all([getAdminTimeseries(range), getAdminDistribution(), getAdminTopUsers()]);
        setSeries(s);
        setDist(d);
        setTopUsers(t.users);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تعذّر تحميل التحليلات');
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  const totalPriority = dist ? dist.priority.NONE + dist.priority.LOW + dist.priority.MEDIUM + dist.priority.HIGH : 0;

  return (
    <div className="admin-analytics">
      <div className="admin-section-header">
        <h2>التحليلات والاتجاهات</h2>
        <div className="range-switch">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`small ${range === r.key ? 'active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="skeleton" style={{ height: 160, marginBottom: 14 }} />}

      {!loading && series && (
        <>
          <MiniBarChart title="مستخدمين جدد" points={series.users} color="var(--accent)" />
          <MiniBarChart title="مهام اتضافت" points={series.itemsCreated} color="#3b82f6" />
          <MiniBarChart title="مهام اتخلّصت" points={series.itemsCompleted} color="#22c55e" />
        </>
      )}

      {dist && (
        <div className="admin-panel">
          <h2>توزيع المهام حسب الأولوية</h2>
          <div className="priority-bars">
            {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((p) => {
              const count = dist.priority[p];
              const pct = totalPriority > 0 ? Math.round((count / totalPriority) * 100) : 0;
              return (
                <div className="priority-row" key={p}>
                  <span className="priority-row-label">{PRIORITY_LABELS[p]}</span>
                  <div className="priority-row-track">
                    <div
                      className="priority-row-fill"
                      style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%`, background: PRIORITY_COLORS[p] }}
                    />
                  </div>
                  <span className="priority-row-count">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {topUsers.length > 0 && (
        <div className="admin-panel">
          <h2>الأكتر نشاطًا (بعدد المهام)</h2>
          <div className="users-table">
            {topUsers.map((u, i) => (
              <div className="user-row" key={u.id}>
                <div className="user-row-info">
                  <strong>
                    #{i + 1} {u.username}
                  </strong>
                  <span className="user-row-meta">
                    {u.itemsCount} مهمة · {u.listsCount} قائمة
                  </span>
                  <span className="user-row-meta">
                    آخر دخول: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-EG') : 'لسه ماسجلش دخول'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

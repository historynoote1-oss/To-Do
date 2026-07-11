import { useState } from 'react';
import { UpdateEntry } from '../lib/api';
import { useUpdatesFeed } from '../hooks/useUpdatesFeed';
import HumanBadge from './HumanBadge';
import UpdateDetailModal from './UpdateDetailModal';
import UpdatesTimelineView from './UpdatesTimelineView';
import UpdatesCompactView from './UpdatesCompactView';
import UpdatesGridView from './UpdatesGridView';

type ViewMode = 'timeline' | 'compact' | 'grid';

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'timeline', label: 'الخط الزمني', icon: '🧵' },
  { key: 'compact', label: 'قائمة سريعة', icon: '📋' },
  { key: 'grid', label: 'شبكة', icon: '▦' },
];

function PinnedStrip({ pinned, onSelect }: { pinned: UpdateEntry[]; onSelect: (u: UpdateEntry) => void }) {
  if (pinned.length === 0) return null;
  return (
    <div className="pinned-strip">
      <div className="pinned-strip-label">📌 أهم التحديثات</div>
      <div className="pinned-strip-row">
        {pinned.map((u) => (
          <button key={u.id} type="button" className="pinned-strip-card" onClick={() => onSelect(u)}>
            <span className="update-grid-emoji">{u.emoji}</span>
            <span className="update-grid-title">{u.title}</span>
            {u.version && <span className="update-compact-meta"><span>الإصدار {u.version}</span></span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function UpdatesLog({ onBack }: { onBack: () => void }) {
  const feed = useUpdatesFeed();
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selected, setSelected] = useState<UpdateEntry | null>(null);

  return (
    <div className="updates-page updates-page-wide">
      <div className="updates-header">
        <button className="small updates-back" onClick={onBack}>
          → رجوع
        </button>
        <h1>📢 التحديثات</h1>
        <p className="updates-subtitle">آخر أخبار وتحسينات الموقع أول بأول</p>
        <HumanBadge authorName="فريقنا" />
      </div>

      <div className="updates-toolbar">
        <div className="updates-search">
          <span className="updates-search-icon">🔍</span>
          <input
            value={feed.query}
            onChange={(e) => feed.setQuery(e.target.value)}
            placeholder="ابحث بالعنوان أو رقم الإصدار (مثلاً: 0.3)"
          />
          {feed.query && (
            <button type="button" className="updates-search-clear" onClick={() => feed.setQuery('')}>
              ✕
            </button>
          )}
        </div>
        <div className="updates-view-toggle">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`updates-view-btn ${viewMode === opt.key ? 'active' : ''}`}
              onClick={() => setViewMode(opt.key)}
              title={opt.label}
            >
              <span>{opt.icon}</span>
              <span className="updates-view-btn-label">{opt.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="small" onClick={feed.refresh}>
          ⟳ الأحدث
        </button>
      </div>

      {!feed.isSearching && <PinnedStrip pinned={feed.pinned} onSelect={setSelected} />}

      {feed.loading && (
        <div className="updates-timeline">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      )}

      {feed.error && <p className="error">⚠️ {feed.error}</p>}

      {!feed.loading && !feed.error && feed.items.length === 0 && (
        <p className="empty">
          <span className="empty-icon">🔍</span>
          مفيش تحديثات مطابقة للبحث
        </p>
      )}

      {!feed.loading && !feed.error && feed.items.length > 0 && (
        <>
          {viewMode === 'timeline' && (
            <UpdatesTimelineView
              items={feed.items}
              hasMore={feed.hasMore}
              loadingMore={feed.loadingMore}
              onLoadMore={feed.loadMore}
            />
          )}
          {viewMode === 'compact' && (
            <UpdatesCompactView
              items={feed.items}
              hasMore={feed.hasMore}
              loadingMore={feed.loadingMore}
              onLoadMore={feed.loadMore}
              onSelect={setSelected}
            />
          )}
          {viewMode === 'grid' && (
            <UpdatesGridView
              items={feed.items}
              hasMore={feed.hasMore}
              loadingMore={feed.loadingMore}
              onLoadMore={feed.loadMore}
              onSelect={setSelected}
            />
          )}
        </>
      )}

      {selected && <UpdateDetailModal update={selected} onClose={() => setSelected(null)} />}

      <div className="updates-footer">
        <p>❤️ شكرًا لدعمكم</p>
        <p>📚 بالتوفيق للجميع</p>
      </div>
    </div>
  );
}

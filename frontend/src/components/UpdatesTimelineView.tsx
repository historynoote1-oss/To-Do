import { useEffect, useRef, useState } from 'react';
import { UpdateEntry } from '../lib/api';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function TimelineCard({ update, isLast }: { update: UpdateEntry; isLast: boolean }) {
  const [openHowTo, setOpenHowTo] = useState(false);
  return (
    <div className="update-card">
      <div className="update-badge">
        <span className="update-badge-emoji">{update.emoji}</span>
        {update.version && <span className="update-badge-num">{update.version}</span>}
        {!isLast && <span className="update-badge-line" />}
      </div>

      <div className="update-content">
        {update.pinned && <span className="pinned-badge">📌 مثبّت</span>}
        <div className="update-meta">
          {update.version && <span className="update-version">الإصدار {update.version}</span>}
          <span className="update-date">{formatDate(update.publishedAt)}</span>
        </div>
        <h2 className="update-title">{update.title}</h2>

        <div className="update-divider" />

        <ul className="update-features">
          {update.features.map((feature, i) => (
            <li key={i}>
              <span className="update-check">✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {update.howToSteps.length > 0 && (
          <div className="update-howto">
            <button className="update-howto-toggle" onClick={() => setOpenHowTo((v) => !v)} type="button">
              <span>💡 {update.howToTitle || 'كيفية الاستخدام'}</span>
              <span className={`update-howto-arrow ${openHowTo ? 'open' : ''}`}>⌄</span>
            </button>
            {openHowTo && (
              <ol className="update-howto-steps">
                {update.howToSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UpdatesTimelineView({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  items: UpdateEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore]);

  return (
    <div className="updates-timeline">
      {items.map((update, index) => (
        <TimelineCard key={update.id} update={update} isLast={index === items.length - 1 && !hasMore} />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="updates-load-sentinel">
          {loadingMore && <span className="updates-loading-text">⏳ جاري تحميل المزيد...</span>}
        </div>
      )}
    </div>
  );
}

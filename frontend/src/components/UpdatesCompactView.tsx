import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { UpdateEntry } from '../lib/api';

const ROW_HEIGHT = 82;

export default function UpdatesCompactView({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
}: {
  items: UpdateEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (update: UpdateEntry) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // بيطلب الصفحة الجاية أوتوماتيك لما المستخدم يوصل قريب من آخر عنصر محمّل،
  // وده اللي بيخلي التقليب في مئات الآلاف من التحديثات إحساسه سلس من غير تقطيع.
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= items.length - 6 && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), items.length, hasMore, loadingMore, onLoadMore]);

  return (
    <div className="updates-compact-list" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const update = items[row.index];
          if (!update) return null;
          return (
            <button
              key={update.id}
              type="button"
              className="update-compact-row"
              style={{
                position: 'absolute',
                top: 0,
                insetInlineStart: 0,
                width: '100%',
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
              onClick={() => onSelect(update)}
            >
              <span className="update-compact-emoji">{update.emoji}</span>
              <span className="update-compact-body">
                <span className="update-compact-title">
                  {update.pinned && <span className="pinned-dot">📌</span>}
                  {update.title}
                </span>
                <span className="update-compact-meta">
                  {update.version && <span>الإصدار {update.version}</span>}
                  <span>
                    {new Date(update.publishedAt).toLocaleDateString('ar-EG', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span>{update.features.length} تحديث فرعي</span>
                </span>
              </span>
              <span className="update-compact-arrow">‹</span>
            </button>
          );
        })}
      </div>
      {loadingMore && <div className="updates-loading-text">⏳ جاري تحميل المزيد...</div>}
    </div>
  );
}

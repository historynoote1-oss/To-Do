import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { UpdateEntry } from '../lib/api';

const ROW_HEIGHT = 168;

function useColumns() {
  const [columns, setColumns] = useState(() => (window.innerWidth >= 900 ? 3 : window.innerWidth >= 600 ? 2 : 1));
  useEffect(() => {
    function onResize() {
      setColumns(window.innerWidth >= 900 ? 3 : window.innerWidth >= 600 ? 2 : 1);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return columns;
}

export default function UpdatesGridView({
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
  const columns = useColumns();
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  useEffect(() => {
    const virtualRows = virtualizer.getVirtualItems();
    const last = virtualRows[virtualRows.length - 1];
    if (last && last.index >= rowCount - 3 && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), rowCount, hasMore, loadingMore, onLoadMore]);

  return (
    <div className="updates-grid-scroll" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const rowItems = items.slice(row.index * columns, row.index * columns + columns);
          return (
            <div
              key={row.index}
              className="update-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                insetInlineStart: 0,
                width: '100%',
                height: row.size,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
              }}
            >
              {rowItems.map((update) => (
                <button
                  key={update.id}
                  type="button"
                  className="update-grid-card"
                  onClick={() => onSelect(update)}
                >
                  {update.pinned && <span className="pinned-badge grid-pinned">📌 مثبّت</span>}
                  <span className="update-grid-emoji">{update.emoji}</span>
                  <span className="update-grid-title">{update.title}</span>
                  <span className="update-grid-meta">
                    {update.version && <span>الإصدار {update.version}</span>}
                    <span>
                      {new Date(update.publishedAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <span className="update-grid-count">{update.features.length} نقطة تحديث</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {loadingMore && <div className="updates-loading-text">⏳ جاري تحميل المزيد...</div>}
    </div>
  );
}

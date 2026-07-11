import { useCallback, useEffect, useRef, useState } from 'react';
import { getPinnedUpdates, getUpdates, UpdateEntry, UpdatesCursor } from '../lib/api';

const PAGE_SIZE = 24;

// Hook مسؤول عن كل منطق تصفح التحديثات: بحث (مع debounce)، تصفح لا نهائي
// بالـ cursor، والتحديثات المثبّتة. مستخدم في الأشكال الثلاثة (خط زمني / مضغوط / شبكة)
// عشان يكون فيه مصدر بيانات واحد وسلوك متطابق بينهم.
export function useUpdatesFeed() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<UpdateEntry[]>([]);
  const [pinned, setPinned] = useState<UpdateEntry[]>([]);
  const [cursor, setCursor] = useState<UpdatesCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async (q: string) => {
    const myRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [pinnedRes, page] = await Promise.all([
        q ? Promise.resolve([]) : getPinnedUpdates(),
        getUpdates({ q, limit: PAGE_SIZE, cursor: null }),
      ]);
      if (myRequest !== requestId.current) return;
      setPinned(pinnedRes);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (err) {
      if (myRequest !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'تعذّر تحميل التحديثات');
    } finally {
      if (myRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(debouncedQuery);
  }, [debouncedQuery, load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await getUpdates({ q: debouncedQuery, limit: PAGE_SIZE, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل المزيد');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, debouncedQuery, hasMore, loading, loadingMore]);

  const refresh = useCallback(() => load(debouncedQuery), [debouncedQuery, load]);

  return {
    query,
    setQuery,
    items,
    pinned,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    isSearching: debouncedQuery.length > 0,
  };
}

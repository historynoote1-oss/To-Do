import { useState } from 'react';
import { searchYoutube, YoutubeSearchResult } from '../lib/api';
import { useMusicPlayer } from '../lib/musicPlayer';
import { DynamicIcon } from '../lib/icons';
import { toast } from '../lib/toast';
import BackButton from './BackButton';

// صفحة "مشغّل الصوت": بحث في يوتيوب وتشغيل أي نتيجة كصوت في الخلفية.
// التشغيل الفعلي بيتم عن طريق MusicPlayerProvider العام (شوف
// lib/musicPlayer.tsx) وشريط التحكم الثابت MusicPlayerBar، عشان الصوت
// يفضل شغّال حتى لو المستخدم سايب الصفحة دي وراح لصفحة تانية في الموقع.
export default function MusicPlayer({
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const { currentTrack, playing, playTrack, playerReady } = useMusicPlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YoutubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const items = await searchYoutube(q);
      setResults(items);
      setSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر البحث حاليًا');
    } finally {
      setLoading(false);
    }
  }

  function handlePlay(item: YoutubeSearchResult) {
    if (!playerReady) {
      toast.info('المشغّل لسه بيجهز، ثانية وحاول تاني');
      return;
    }
    playTrack({ videoId: item.videoId, title: item.title, channel: item.channel, thumbnail: item.thumbnail });
  }

  return (
    <div className="container view-fade profile-page music-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>مشغّل الصوت</strong>
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

      <p className="music-page-intro">
        دوّر على أي أغنية أو فيديو وسمّعه كصوت، وسيبه شغّال وانت بتتنقّل بين صفحات الموقع.
      </p>

      <div className="list-card music-search-panel">
        <div className="music-search-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="اكتب اسم الأغنية أو الفيديو..."
            aria-label="بحث في يوتيوب"
          />
          <button type="button" onClick={handleSearch} disabled={loading || !query.trim()}>
            <DynamicIcon name="search" size={16} />
            بحث
          </button>
        </div>
      </div>

      {loading && (
        <div className="music-results">
          <div className="skeleton skeleton-card music-skeleton-card" />
          <div className="skeleton skeleton-card music-skeleton-card" />
          <div className="skeleton skeleton-card music-skeleton-card" />
        </div>
      )}

      {!loading && !searched && (
        <p className="empty">
          <DynamicIcon name="music" size={32} className="empty-icon" />
          اكتب اللي عايز تسمعه وهيظهر هنا
        </p>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="empty">
          <DynamicIcon name="search" size={32} className="empty-icon" />
          مفيش نتائج، جرّب كلمات تانية
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="music-results">
          {results.map((item) => {
            const isActive = currentTrack?.videoId === item.videoId;
            return (
              <button
                key={item.videoId}
                type="button"
                className={`list-card music-result-card ${isActive ? 'active' : ''}`}
                onClick={() => handlePlay(item)}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="music-result-thumb" />
                ) : (
                  <span className="music-result-thumb music-result-thumb-fallback" aria-hidden="true">
                    <DynamicIcon name="music" size={20} />
                  </span>
                )}
                <span className="music-result-info">
                  <strong>{item.title}</strong>
                  <span>{item.channel}</span>
                </span>
                <span className="music-result-play-badge" aria-hidden="true">
                  <DynamicIcon name={isActive && playing ? 'pause' : 'play'} size={16} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

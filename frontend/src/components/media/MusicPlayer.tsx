import { useState } from 'react';
import { searchYoutube, YoutubeSearchResult } from '@/lib/api/api';
import { useMusicPlayer, YoutubeTrack } from '@/lib/audio/musicPlayer';
import { DynamicIcon } from '@/lib/core/icons';
import { toast } from '@/lib/core/toast';
import BackButton from '@/components/layout/BackButton';

// صفحة "مشغّل القرآن": بحث عن تلاوات وسور وقرّاء وتشغيلها كصوت في الخلفية،
// بلوحة تحكم شاملة (تشغيل، تكرار، تقديم/ترجيع، صوت، سرعة، مؤقّت نوم،
// مفضّلة، وسجل استماع). التشغيل الفعلي بيتم عن طريق MusicPlayerProvider
// العام (شوف lib/musicPlayer.tsx)، عشان الصوت يفضل شغّال حتى لو المستخدم
// سايب الصفحة دي وراح لصفحة تانية في الموقع.

const SLEEP_TIMER_OPTIONS = [10, 20, 30, 45, 60];
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// اليوتيوب بيرجّع أي حاجة لو البحث عام، فبنضيف كلمة "قرآن كريم" تلقائيًا
// لما المستخدم مكتبهاش صراحة، عشان النتايج تفضل تلاوات مش أغاني أو فيديوهات
// عامة — ده لب طلب المستخدم إن الصفحة تدوّر على صوت قرآن مش أغنية.
function buildQuranQuery(raw: string): string {
  const q = raw.trim();
  if (/قرآن|قران|تلاوة|surah|quran/i.test(q)) return q;
  return `${q} قرآن كريم`;
}

// الصفحة دي مخصّصة لتلاوات القرآن بس، فبنمنع بحث المستخدم لو كلمات البحث
// نفسها بتدل صراحةً على أغنية/موسيقى (بالعربي أو الإنجليزي) — ده فحص أوّلي
// في الواجهة عشان يوقف الطلب بدري ويدي رسالة واضحة، والسيرفر (youtube.ts)
// بيعمل نفس الفحص كمان كخط دفاع تاني مستقل عن الواجهة.
const MUSIC_BLOCKLIST =
  /اغني|أغني|اغاني|أغاني|غناء|مهرجان|كليب|ريمكس|موسيقي|موسيقى|مزيكا|دي جي|راب\b|\bsong\b|\bsongs\b|\bmusic\b|\bremix\b|\blyrics?\b|\brap\b/i;

function containsMusicKeywords(raw: string): boolean {
  return MUSIC_BLOCKLIST.test(raw);
}

export default function MusicPlayer({
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const {
    currentTrack,
    playing,
    looping,
    playerReady,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    favorites,
    recentlyPlayed,
    sleepMinutes,
    sleepRemainingSeconds,
    playTrack,
    togglePlayPause,
    toggleLoop,
    seekToRatio,
    skip,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFavorite,
    isFavorite,
    setSleepTimer,
  } = useMusicPlayer();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YoutubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'favorites' | 'recent'>('favorites');
  // قائمة التشغيل الحالية (آخر قائمة ضغط منها المستخدم على تلاوة) — بتُستخدم
  // في زرّاري "التالي/السابق" في لوحة التحكم عشان المستخدم يقدر يتنقّل بين
  // نتايج البحث أو المفضّلة/آخر استماع من غير ما يرجع يدوس على كل تلاوة.
  const [activeQueue, setActiveQueue] = useState<YoutubeTrack[]>([]);

  async function runSearch(rawQuery: string) {
    const q = rawQuery.trim();
    if (!q) return;
    if (containsMusicKeywords(q)) {
      toast.error('الصفحة دي مخصّصة لتلاوات القرآن الكريم بس، مش أغاني أو موسيقى');
      return;
    }
    setLoading(true);
    try {
      const items = await searchYoutube(buildQuranQuery(q));
      setResults(items);
      setSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر البحث حاليًا');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    runSearch(query);
  }

  function handlePlay(item: YoutubeSearchResult) {
    if (!playerReady) {
      toast.info('المشغّل لسه بيجهز، ثانية وحاول تاني');
      return;
    }
    setActiveQueue(results.map((r) => ({ videoId: r.videoId, title: r.title, channel: r.channel, thumbnail: r.thumbnail })));
    playTrack({ videoId: item.videoId, title: item.title, channel: item.channel, thumbnail: item.thumbnail });
  }

  function handlePlayTrack(track: YoutubeTrack, queue: YoutubeTrack[]) {
    if (!playerReady) {
      toast.info('المشغّل لسه بيجهز، ثانية وحاول تاني');
      return;
    }
    setActiveQueue(queue);
    playTrack(track);
  }

  function playRelative(offset: 1 | -1) {
    if (!currentTrack || activeQueue.length < 2) return;
    const idx = activeQueue.findIndex((t) => t.videoId === currentTrack.videoId);
    if (idx === -1) return;
    const nextIdx = (idx + offset + activeQueue.length) % activeQueue.length;
    handlePlayTrack(activeQueue[nextIdx], activeQueue);
  }

  const ratio = duration > 0 ? currentTime / duration : 0;
  const libraryList = libraryTab === 'favorites' ? favorites : recentlyPlayed;
  const queuePosition =
    currentTrack && activeQueue.length > 1 ? activeQueue.findIndex((t) => t.videoId === currentTrack.videoId) : -1;

  return (
    <div className="container view-fade profile-page music-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>مشغّل القرآن</strong>
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
        دوّر على أي سورة أو قارئ وسمّعها كصوت في الخلفية، وسيبها شغّالة وانت بتتنقّل بين صفحات الموقع.
      </p>

      {/* ===== لوحة التحكم الشاملة — بتظهر لما فيه مقطع محمّل ===== */}
      {currentTrack && (
        <div className="list-card music-control-panel">
          <div className="music-control-now-playing">
            {currentTrack.thumbnail ? (
              <img src={currentTrack.thumbnail} alt="" className="music-control-thumb" />
            ) : (
              <span className="music-control-thumb music-control-thumb-fallback" aria-hidden="true">
                <DynamicIcon name="book-open" size={26} />
              </span>
            )}
            <div className="music-control-info">
              <strong>{currentTrack.title}</strong>
              <span>
                {currentTrack.channel || 'تلاوة قرآنية'}
                {queuePosition > -1 && ` · ${queuePosition + 1} / ${activeQueue.length}`}
              </span>
            </div>
            <button
              type="button"
              className={`icon-btn small music-control-fav ${isFavorite(currentTrack.videoId) ? 'active' : ''}`}
              onClick={() => toggleFavorite(currentTrack)}
              aria-pressed={isFavorite(currentTrack.videoId)}
              aria-label="إضافة للمفضّلة"
              title="إضافة للمفضّلة"
            >
              <DynamicIcon name="heart" size={16} strokeWidth={2.25} />
            </button>
          </div>

          <div className="music-control-seek">
            <span className="time-mono">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.min(100, Math.max(0, ratio * 100))}
              onChange={(e) => seekToRatio(Number(e.target.value) / 100)}
              aria-label="موضع التشغيل"
            />
            <span className="time-mono">{formatTime(duration)}</span>
          </div>

          <div className="music-control-transport">
            <button
              type="button"
              className={`icon-btn ${looping ? 'active' : ''}`}
              onClick={toggleLoop}
              aria-pressed={looping}
              aria-label="تكرار التلاوة"
              title="تكرار التلاوة"
            >
              <DynamicIcon name="repeat" size={16} />
            </button>
            {activeQueue.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => playRelative(-1)}
                aria-label="التلاوة السابقة"
                title="التلاوة السابقة"
              >
                <DynamicIcon name="skip-back" size={16} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => skip(-10)}
              aria-label="ترجيع 10 ثواني"
              title="ترجيع 10 ثواني"
            >
              <DynamicIcon name="rotate-ccw" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn music-control-playpause"
              onClick={togglePlayPause}
              aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
              title={playing ? 'إيقاف مؤقت' : 'تشغيل'}
            >
              <DynamicIcon name={playing ? 'pause' : 'play'} size={22} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => skip(10)}
              aria-label="تقديم 10 ثواني"
              title="تقديم 10 ثواني"
            >
              <DynamicIcon name="rotate-cw" size={17} />
            </button>
            {activeQueue.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => playRelative(1)}
                aria-label="التلاوة التالية"
                title="التلاوة التالية"
              >
                <DynamicIcon name="skip-forward" size={16} />
              </button>
            )}
            <button
              type="button"
              className={`icon-btn ${muted ? 'active' : ''}`}
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'إلغاء الكتم' : 'كتم الصوت'}
              title={muted ? 'إلغاء الكتم' : 'كتم الصوت'}
            >
              <DynamicIcon name={muted ? 'volume-off' : 'volume-high'} size={16} />
            </button>
          </div>

          <div className="music-control-row">
            <DynamicIcon name={muted ? 'volume-off' : 'volume-high'} size={14} className="music-control-row-icon" />
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="مستوى الصوت"
            />
          </div>

          <div className="music-control-chip-row">
            <span className="music-control-chip-label">
              <DynamicIcon name="gauge" size={13} /> السرعة
            </span>
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`music-chip ${playbackRate === rate ? 'active' : ''}`}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>

          <div className="music-control-chip-row">
            <span className="music-control-chip-label">
              <DynamicIcon name="moon-star" size={13} /> مؤقّت نوم
            </span>
            {SLEEP_TIMER_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                className={`music-chip ${sleepMinutes === mins ? 'active' : ''}`}
                onClick={() => setSleepTimer(sleepMinutes === mins ? null : mins)}
              >
                {mins} د
              </button>
            ))}
            {sleepMinutes != null && (
              <button type="button" className="music-chip music-chip-cancel" onClick={() => setSleepTimer(null)}>
                <DynamicIcon name="x" size={12} />
                {sleepRemainingSeconds != null ? formatTime(sleepRemainingSeconds) : ''}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="list-card music-search-panel">
        <div className="music-search-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="اكتب اسم السورة أو القارئ..."
            aria-label="بحث عن تلاوة قرآنية"
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
              <div key={item.videoId} className={`list-card music-result-card ${isActive ? 'active' : ''}`}>
                <button type="button" className="music-result-card-main" onClick={() => handlePlay(item)}>
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="music-result-thumb" loading="lazy" decoding="async" />
                  ) : (
                    <span className="music-result-thumb music-result-thumb-fallback" aria-hidden="true">
                      <DynamicIcon name="book-open" size={20} />
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
                <button
                  type="button"
                  className={`icon-btn small music-result-fav ${isFavorite(item.videoId) ? 'active' : ''}`}
                  onClick={() =>
                    toggleFavorite({ videoId: item.videoId, title: item.title, channel: item.channel, thumbnail: item.thumbnail })
                  }
                  aria-pressed={isFavorite(item.videoId)}
                  aria-label="إضافة للمفضّلة"
                  title="إضافة للمفضّلة"
                >
                  <DynamicIcon name="heart" size={16} strokeWidth={2.25} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !searched && (
        <div className="music-library">
          <div className="music-library-tabs">
            <button
              type="button"
              className={`music-library-tab ${libraryTab === 'favorites' ? 'active' : ''}`}
              onClick={() => setLibraryTab('favorites')}
            >
              <DynamicIcon name="heart" size={14} />
              المفضّلة ({favorites.length})
            </button>
            <button
              type="button"
              className={`music-library-tab ${libraryTab === 'recent' ? 'active' : ''}`}
              onClick={() => setLibraryTab('recent')}
            >
              <DynamicIcon name="history" size={14} />
              آخر استماع ({recentlyPlayed.length})
            </button>
          </div>

          {libraryList.length === 0 ? (
            <p className="empty">
              <DynamicIcon name={libraryTab === 'favorites' ? 'heart' : 'list-music'} size={32} className="empty-icon" />
              {libraryTab === 'favorites' ? 'مفيش تلاوات مفضّلة لسه' : 'مفيش سجل استماع لسه'}
              <br />
              ابحث عن سورة أو قارئ وهيظهر هنا
            </p>
          ) : (
            <div className="music-results">
              {libraryList.map((track) => {
                const isActive = currentTrack?.videoId === track.videoId;
                return (
                  <div key={track.videoId} className={`list-card music-result-card ${isActive ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="music-result-card-main"
                      onClick={() => handlePlayTrack(track, libraryList)}
                    >
                      {track.thumbnail ? (
                        <img src={track.thumbnail} alt="" className="music-result-thumb" loading="lazy" decoding="async" />
                      ) : (
                        <span className="music-result-thumb music-result-thumb-fallback" aria-hidden="true">
                          <DynamicIcon name="book-open" size={20} />
                        </span>
                      )}
                      <span className="music-result-info">
                        <strong>{track.title}</strong>
                        <span>{track.channel}</span>
                      </span>
                      <span className="music-result-play-badge" aria-hidden="true">
                        <DynamicIcon name={isActive && playing ? 'pause' : 'play'} size={16} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`icon-btn small music-result-fav ${isFavorite(track.videoId) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(track)}
                      aria-pressed={isFavorite(track.videoId)}
                      aria-label="إضافة للمفضّلة"
                      title="إضافة للمفضّلة"
                    >
                      <DynamicIcon name="heart" size={16} strokeWidth={2.25} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

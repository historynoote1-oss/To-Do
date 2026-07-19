import { useState, useEffect } from 'react';
import { useMusicPlayer } from '../lib/musicPlayer';
import { DynamicIcon } from '../lib/icons';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// شريط تشغيل ثابت أسفل الشاشة — بيظهر في أي صفحة في الموقع طول ما فيه
// مقطع محمّل، مش بس جوه صفحة "مشغّل الصوت" نفسها (زي شريط التشغيل في
// سبوتيفاي). بيقرا حالته من MusicPlayerProvider العام، فبيفضل متزامن مع
// المشغّل الحقيقي مهما اتنقّل المستخدم بين الصفحات.
export default function MusicPlayerBar({ onOpenPlayer, isOnPlayerPage }: { onOpenPlayer: () => void; isOnPlayerPage: boolean }) {
  const { currentTrack, playing, looping, currentTime, duration, togglePlayPause, toggleLoop, seekToRatio, skip } = useMusicPlayer();
  const [dismissed, setDismissed] = useState(false);

  // إعادة الإظهار لما تتغير التلاوة
  useEffect(() => {
    setDismissed(false);
  }, [currentTrack?.videoId]);

  if (!currentTrack || dismissed) return null;

  const ratio = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={`music-player-bar ${isOnPlayerPage ? 'on-player-page' : ''}`} role="region" aria-label="مشغّل القرآن">
      <button
        type="button"
        className="music-player-bar-track"
        onClick={onOpenPlayer}
        disabled={isOnPlayerPage}
        aria-label={`فتح مشغّل القرآن — ${currentTrack.title}`}
      >
        {currentTrack.thumbnail ? (
          <img src={currentTrack.thumbnail} alt="" className="music-player-bar-thumb" />
        ) : (
          <span className="music-player-bar-thumb music-player-bar-thumb-fallback" aria-hidden="true">
            <DynamicIcon name="book-open" size={16} />
          </span>
        )}
        <span className="music-player-bar-info">
          <strong>{currentTrack.title}</strong>
          <span>{currentTrack.channel}</span>
        </span>
      </button>

      <div className="music-player-bar-seek">
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

      <div className="music-player-bar-controls">
        <button
          type="button"
          className={`icon-btn small ${looping ? 'active' : ''}`}
          onClick={toggleLoop}
          aria-pressed={looping}
          aria-label="تكرار التلاوة"
          title="تكرار التلاوة"
        >
          <DynamicIcon name="repeat" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn small music-player-bar-skip"
          onClick={() => skip(-10)}
          aria-label="ترجيع 10 ثواني"
          title="ترجيع 10 ثواني"
        >
          <DynamicIcon name="rotate-ccw" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn music-player-bar-playpause"
          onClick={togglePlayPause}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          title={playing ? 'إيقاف مؤقت' : 'تشغيل'}
        >
          <DynamicIcon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <button
          type="button"
          className="icon-btn small music-player-bar-skip"
          onClick={() => skip(10)}
          aria-label="تقديم 10 ثواني"
          title="تقديم 10 ثواني"
        >
          <DynamicIcon name="rotate-cw" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn small music-player-bar-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="إخفاء الشريط"
          title="إخفاء"
        >
          <DynamicIcon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

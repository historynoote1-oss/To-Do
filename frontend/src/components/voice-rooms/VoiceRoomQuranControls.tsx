// ===== لوحة تحكم الأدمن في مشغّل القرآن (Pause/Resume/Stop/Next/Previous/
// Repeat/Shuffle/Volume) — زي لوحة تحكم بوتات ديسكورد الصوتية (Luna bot
// وأمثالها). بتظهر للأدمن بس، وبتتفعّل تلقائي أول ما فيه تلاوة شغّالة أو
// حاجة في قائمة الانتظار.

import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import type { VoiceRoomControlAction, VoiceRoomPlayback } from '@/hooks/voiceRoomSession';

export default function VoiceRoomQuranControls({
  playback,
  queue,
  repeat,
  shuffle,
  volume,
  onControl,
}: {
  playback: VoiceRoomPlayback | null;
  queue: VoiceRoomPlayback[];
  repeat: boolean;
  shuffle: boolean;
  volume: number;
  onControl: (action: VoiceRoomControlAction, value?: number) => Promise<{ error?: string }>;
}) {
  async function run(action: VoiceRoomControlAction, value?: number) {
    sounds.click();
    const result = await onControl(action, value);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
    }
  }

  if (!playback && queue.length === 0) return null;

  return (
    <div className="voice-room-quran-controls">
      <div className="voice-room-quran-controls-header">
        <DynamicIcon name="radio" size={14} />
        <span>لوحة تحكم مشغّل القرآن</span>
      </div>
      <div className="voice-room-quran-controls-buttons">
        <button type="button" className="icon-btn" title="السابق" onClick={() => run('previous')}>
          <DynamicIcon name="skip-back" size={18} />
        </button>
        {playback?.paused ? (
          <button type="button" className="icon-btn" title="استكمال" onClick={() => run('resume')}>
            <DynamicIcon name="play" size={18} />
          </button>
        ) : (
          <button type="button" className="icon-btn" title="إيقاف مؤقت" onClick={() => run('pause')}>
            <DynamicIcon name="pause" size={18} />
          </button>
        )}
        <button type="button" className="icon-btn" title="التالي" onClick={() => run('next')}>
          <DynamicIcon name="skip-forward" size={18} />
        </button>
        <button type="button" className="icon-btn voice-room-quran-stop" title="إيقاف كامل" onClick={() => run('stop')}>
          <DynamicIcon name="square" size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn ${repeat ? 'is-active' : ''}`}
          title="تكرار"
          onClick={() => run('repeat')}
        >
          <DynamicIcon name="repeat" size={18} />
        </button>
        <button
          type="button"
          className={`icon-btn ${shuffle ? 'is-active' : ''}`}
          title="عشوائي"
          onClick={() => run('shuffle')}
        >
          <DynamicIcon name="shuffle" size={18} />
        </button>
      </div>
      <div className="voice-room-quran-controls-volume">
        <DynamicIcon name="volume-high" size={14} />
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={volume}
          onMouseUp={(e) => run('volume', Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => run('volume', Number((e.target as HTMLInputElement).value))}
          aria-label="صوت التلاوة لكل الأعضاء"
        />
      </div>
      {queue.length > 0 && (
        <div className="voice-room-quran-queue">
          <strong>قائمة الانتظار ({queue.length})</strong>
          <ul>
            {queue.map((item, i) => (
              <li key={`${item.videoId}-${i}`}>{item.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import { useVoiceRoomSession } from '@/hooks/voiceRoomSession';
import { DynamicIcon } from '@/utils/icons';

// ===== شريط عائم صغير: "لسه متواجد في غرفة صوتية" =====
// بيظهر فوق أي صفحة في التطبيق (المهام، البروفايل، مشغّل الموسيقى...) ما
// دام العضو متصل بغرفة صوتية بس مش شايف شاشتها دلوقتي — بالظبط زي الشريط
// الصغير اللي بيظهر تحت في ديسكورد لما تصغّر شاشة المكالمة. بيدّي المستخدم
// تأكيد بصري إنه لسه بيسمع، مع رجوع سريع للشاشة أو قفل السماعة أو خروج
// مباشر من غير ما يفتح صفحة الغرف الصوتية تاني.
export default function VoiceRoomMiniBar({
  hidden,
  onOpen,
}: {
  hidden: boolean;
  onOpen: () => void;
}) {
  const { activeRoomId, roomName, status, playback, deafened, toggleDeafen, leaveRoom } = useVoiceRoomSession();

  if (hidden || !activeRoomId || status !== 'joined') return null;

  return (
    <button type="button" className="voice-room-minibar" onClick={onOpen}>
      <span className="voice-room-minibar-icon">
        <DynamicIcon name="radio" size={16} />
      </span>
      <span className="voice-room-minibar-text">
        <strong>{roomName || 'غرفة صوتية'}</strong>
        <span>{playback ? playback.title : 'متصل بالغرفة الصوتية'}</span>
      </span>
      <span
        className="voice-room-minibar-action"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          toggleDeafen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            toggleDeafen();
          }
        }}
        title={deafened ? 'دوس عشان تسمع' : 'دوس عشان تقفل السماعة'}
        aria-pressed={!deafened}
      >
        <DynamicIcon name={deafened ? 'volume-off' : 'headphones'} size={16} />
      </span>
      <span
        className="voice-room-minibar-action voice-room-minibar-leave"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          leaveRoom();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            leaveRoom();
          }
        }}
        title="خروج من الغرفة"
      >
        <DynamicIcon name="phone-off" size={16} />
      </span>
    </button>
  );
}

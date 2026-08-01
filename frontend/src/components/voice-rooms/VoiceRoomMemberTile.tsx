// ===== مربع عضو داخل شبكة المكالمة (زي ديسكورد بالظبط) =====
// كل عضو مربّع بخلفية لونية ثابتة مُشتقّة من اسمه (نفس اللون دايمًا لنفس
// الشخص)، صورة بروفايل كبيرة وواضحة في النص، واسمه في شريط سفلي شفاف.
// مفيش مايك هنا خالص (مفيش صوت داخل من الأعضاء) — بس شارة "أدمن" لو عضو
// أدمن، وشارة "بوت" لو ده بوت مشغّل القرآن (هيتفعّل في مرحلة تالية).

import { DynamicIcon } from '@/utils/icons';
import { resolveAvatarUrl } from '@/services/api/profile';
import type { VoiceRoomMember } from '@/hooks/voiceRoomSocket';

const TILE_COLORS = [
  '#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245',
  '#9b59b6', '#1abc9c', '#e67e22', '#3498db', '#f47fff',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

export default function VoiceRoomMemberTile({
  member,
  isBot = false,
}: {
  member: VoiceRoomMember;
  isBot?: boolean;
}) {
  const bot = isBot || member.isBot;
  const url = resolveAvatarUrl(member.avatarUrl);
  const initial = member.username.trim().charAt(0).toUpperCase() || '؟';
  const bg = colorForName(member.username || member.userId);

  return (
    <div className={`voice-room-tile ${bot ? 'is-bot' : ''}`} style={{ background: `linear-gradient(155deg, ${bg}55, ${bg}22)` }}>
      <span className="voice-room-tile-avatar">
        {url ? <img src={url} alt="" /> : <span aria-hidden="true">{bot ? '📖' : initial}</span>}
      </span>
      {!bot && member.isMuted && (
        <span className="voice-room-tile-muted-badge" title="مكتوم من الشات">
          <DynamicIcon name="mic-off" size={12} />
        </span>
      )}
      <span className="voice-room-tile-name-pill">
        {member.isAdmin && !bot && <DynamicIcon name="crown" size={12} className="voice-room-tile-crown" />}
        {!member.isAdmin && member.isModerator && !bot && (
          <DynamicIcon name="shield" size={12} className="voice-room-tile-crown" />
        )}
        {bot && <DynamicIcon name="radio" size={12} className="voice-room-tile-crown" />}
        <span className="voice-room-tile-name-text">{member.username}</span>
      </span>
    </div>
  );
}

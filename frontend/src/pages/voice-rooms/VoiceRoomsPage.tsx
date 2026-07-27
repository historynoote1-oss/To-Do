import { useEffect, useMemo, useState } from 'react';
import { getVoiceRooms, VoiceRoomSummary } from '@/services/api';
import { useVoiceRoomsPreview, VoiceRoomMember } from '@/hooks/voiceRoomSocket';
import { useVoiceRoomSession } from '@/hooks/voiceRoomSession';
import { useVoiceDeafenPreference } from '@/hooks/useVoiceDeafenPreference';
import { resolveAvatarUrl } from '@/services/api/profile';
import { toast } from '@/utils/toast';
import { DynamicIcon } from '@/utils/icons';
import BackButton from '@/components/layout/BackButton';
import ConfirmModal from '@/components/common/ConfirmModal';
import RoomDurationTimer from '@/components/voice-rooms/RoomDurationTimer';
import VoiceRoomView from '@/pages/voice-rooms/VoiceRoomView';

// أفتار عضو صغير لمعاينة القايمة من برا (نفس روح MemberAvatar جوه الغرفة
// نفسها، بس نسخة مصغّرة هنا عشان الصفحتين تفضلوا ملفات منفصلة وواضحة).
function PreviewAvatar({ member, size = 36 }: { member: VoiceRoomMember; size?: number }) {
  const url = resolveAvatarUrl(member.avatarUrl);
  const initial = member.username.trim().charAt(0).toUpperCase() || '؟';
  return (
    <span
      className={`voice-room-member-avatar ${member.isAdmin ? 'is-admin' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.42) }}
    >
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initial}</span>}
      <span className="voice-room-member-online-dot" aria-hidden="true" />
    </span>
  );
}

export default function VoiceRoomsPage({
  isAdmin,
  username,
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  isAdmin: boolean;
  username: string;
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const [rooms, setRooms] = useState<VoiceRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // الغرفة المطلوب تأكيد الدخول ليها — زي ديسكورد بالظبط: تدوس على الروم
  // أو على أي عضو فيه فتشوفه من برا، وبعدين تتسأل "تنضم؟" قبل ما تدخل فعليًا.
  const [pendingJoin, setPendingJoin] = useState<VoiceRoomSummary | null>(null);

  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const { membersByRoom, sessionsByRoom } = useVoiceRoomsPreview(roomIds);
  const { deafened, toggle: toggleDeafen } = useVoiceDeafenPreference();
  // الجلسة الصوتية مركزية (شوف hooks/voiceRoomSession.tsx) وبتفضل شغالة
  // حتى لو الصفحة دي اتقفلت. لو العضو أصلًا متواجد في غرفة (activeRoomId)
  // ورجع للصفحة دي، بنعرضله شاشة المكالمة على طول من غير ما يضغط دخول تاني.
  const { activeRoomId, joinRoom } = useVoiceRoomSession();
  // بنتحكم في إظهار شاشة المكالمة الكاملة من هنا مستقل عن الاتصال نفسه:
  // العضو ممكن يكون متصل فعليًا (activeRoomId) بس صغّر الشاشة ورجع لقايمة
  // الغرف (viewingCall = false) وهو لسه بيسمع التلاوة في الخلفية. لو
  // activeRoomId اتظبط لأول مرة (انضمام جديد) أو الصفحة دي اتفتحت والعضو
  // أصلًا متواجد في غرفة من قبل، بنعرضله شاشة المكالمة تلقائيًا.
  const [viewingCall, setViewingCall] = useState(false);
  useEffect(() => {
    if (activeRoomId) setViewingCall(true);
  }, [activeRoomId]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getVoiceRooms();
      setRooms(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر تحميل الغرف الصوتية';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (activeRoomId && viewingCall) {
    return (
      <VoiceRoomView
        roomId={activeRoomId}
        isAdmin={isAdmin}
        username={username}
        onBack={() => setViewingCall(false)}
        onOpenMenu={onOpenMenu}
        menuOpen={menuOpen}
      />
    );
  }

  return (
    <div className="container view-fade profile-page voice-room-list-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>الغرف الصوتية</strong>
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
        غرف شات صوتية بدون مايك — تلاوة مُذاعة يشغّلها الأدمن يسمعها كل الأعضاء المتواجدين، مع شات نصي بينكم. تقدر تشوف مين متواجد في كل غرفة قبل ما تدخلها.
      </p>

      {loading ? (
        <div className="voice-room-list">
          <div className="skeleton voice-room-card-skeleton" />
          <div className="skeleton voice-room-card-skeleton" />
          <div className="skeleton voice-room-card-skeleton" />
        </div>
      ) : loadError ? (
        <div className="empty voice-room-error-state">
          <DynamicIcon name="wifi-off" size={32} className="empty-icon" />
          تعذّر تحميل الغرف الصوتية
          <br />
          <button type="button" className="small" onClick={load}>
            <DynamicIcon name="refresh-cw" size={14} />
            حاول تاني
          </button>
        </div>
      ) : rooms.length === 0 ? (
        <p className="empty">
          <DynamicIcon name="radio" size={32} className="empty-icon" />
          مفيش غرف صوتية معاك صلاحية دخولها لسه
          <br />
          اطلب من الأدمن يضيفك لغرفة
        </p>
      ) : (
        <div className="voice-room-list">
          {rooms.map((room) => {
            const members = membersByRoom[room.id] ?? room.members ?? [];
            const sessionStartedAtMs = sessionsByRoom[room.id] ?? room.sessionStartedAtMs ?? null;
            const previewMembers = members.slice(0, 5);
            const extraCount = members.length - previewMembers.length;
            const isCurrentRoom = activeRoomId === room.id;
            return (
              <button
                key={room.id}
                type="button"
                className={`voice-room-card ${isCurrentRoom ? 'is-current-room' : ''}`}
                onClick={() => (isCurrentRoom ? setViewingCall(true) : setPendingJoin(room))}
              >
                <div className="voice-room-card-top">
                  <span className="voice-room-card-icon">
                    <DynamicIcon name="radio" size={20} />
                  </span>
                  <div className="voice-room-card-heading">
                    <span className="voice-room-card-name">{room.name}</span>
                    {room.description && <span className="voice-room-card-desc">{room.description}</span>}
                  </div>
                  <div className="voice-room-card-meta">
                    <RoomDurationTimer startedAtMs={sessionStartedAtMs} />
                    <span className="voice-room-card-count">
                      <DynamicIcon name="users" size={13} />
                      {members.length}
                    </span>
                  </div>
                </div>

                {previewMembers.length > 0 ? (
                  <div className="voice-room-card-members">
                    {previewMembers.map((m) => (
                      <span key={m.userId} className={`voice-room-card-member ${m.isAdmin ? 'is-admin' : ''}`}>
                        <PreviewAvatar member={m} />
                        <span className="voice-room-card-member-name">{m.username}</span>
                        {m.isAdmin && (
                          <span className="voice-room-sidebar-admin-badge">
                            <DynamicIcon name="crown" size={11} />
                          </span>
                        )}
                      </span>
                    ))}
                    {extraCount > 0 && <span className="voice-room-card-member-extra">+{extraCount}</span>}
                  </div>
                ) : (
                  <div className="voice-room-card-empty-row">مفيش حد متواجد دلوقتي</div>
                )}

                <div className="voice-room-card-bottom">
                  <span
                    role="button"
                    tabIndex={0}
                    className={`voice-room-card-deafen ${deafened ? 'is-deafened' : ''}`}
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
                    title={deafened ? 'السماعة مقفولة — دوس عشان تسمع' : 'السماعة مفتوحة — دوس عشان تقفلها'}
                    aria-pressed={!deafened}
                  >
                    <DynamicIcon name={deafened ? 'volume-off' : 'headphones'} size={14} />
                    {deafened ? 'مقفولة' : 'بتسمع'}
                  </span>
                  <span className="voice-room-card-join-hint">
                    {isCurrentRoom ? 'أنت متواجد الآن — رجوع للمكالمة' : 'انضمام'}
                    <DynamicIcon name="chevron-left" size={14} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {pendingJoin && (
        <ConfirmModal
          title={`الانضمام لغرفة "${pendingJoin.name}"؟`}
          description="هتدخل الشات الصوتي وتظهر لباقي الأعضاء إنك متواجد دلوقتي."
          confirmLabel="انضمام"
          cancelLabel="إلغاء"
          danger={false}
          onCancel={() => setPendingJoin(null)}
          onConfirm={() => {
            joinRoom(pendingJoin.id, { name: pendingJoin.name, description: pendingJoin.description });
            setViewingCall(true);
            setPendingJoin(null);
          }}
        />
      )}
    </div>
  );
}

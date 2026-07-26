import { useEffect, useMemo, useState } from 'react';
import { getVoiceRooms, VoiceRoomSummary } from '@/services/api';
import { useVoiceRoomsPreview, VoiceRoomMember } from '@/hooks/voiceRoomSocket';
import { resolveAvatarUrl } from '@/services/api/profile';
import { toast } from '@/utils/toast';
import { DynamicIcon } from '@/utils/icons';
import BackButton from '@/components/layout/BackButton';
import ConfirmModal from '@/components/common/ConfirmModal';
import VoiceRoomView from '@/pages/voice-rooms/VoiceRoomView';

// أفتار عضو صغير لمعاينة القايمة من برا (نفس روح MemberAvatar جوه الغرفة
// نفسها، بس نسخة مصغّرة هنا عشان الصفحتين تفضلوا ملفات منفصلة وواضحة).
function PreviewAvatar({ member, size = 26 }: { member: VoiceRoomMember; size?: number }) {
  const url = resolveAvatarUrl(member.avatarUrl);
  const initial = member.username.trim().charAt(0).toUpperCase() || '؟';
  return (
    <span
      className={`voice-room-member-avatar ${member.isAdmin ? 'is-admin' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
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
  const [selectedRoom, setSelectedRoom] = useState<VoiceRoomSummary | null>(null);
  // الغرفة المطلوب تأكيد الدخول ليها — زي ديسكورد بالظبط: تدوس على الروم
  // أو على أي عضو فيه فتشوفه من برا، وبعدين تتسأل "تنضم؟" قبل ما تدخل فعليًا.
  const [pendingJoin, setPendingJoin] = useState<VoiceRoomSummary | null>(null);

  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const liveMembers = useVoiceRoomsPreview(roomIds);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getVoiceRooms();
      setRooms(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل الغرف الصوتية');
    } finally {
      setLoading(false);
    }
  }

  if (selectedRoom) {
    return (
      <VoiceRoomView
        roomId={selectedRoom.id}
        roomName={selectedRoom.name}
        isAdmin={isAdmin}
        username={username}
        onBack={() => setSelectedRoom(null)}
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
        <div className="music-results">
          <div className="skeleton skeleton-card music-skeleton-card" />
          <div className="skeleton skeleton-card music-skeleton-card" />
        </div>
      ) : rooms.length === 0 ? (
        <p className="empty">
          <DynamicIcon name="radio" size={32} className="empty-icon" />
          مفيش غرف صوتية معاك صلاحية دخولها لسه
          <br />
          اطلب من الأدمن يضيفك لغرفة
        </p>
      ) : (
        <div className="music-results">
          {rooms.map((room) => {
            const members = liveMembers[room.id] ?? room.members ?? [];
            return (
              <div key={room.id} className="voice-room-preview-card">
                <button type="button" className="voice-room-preview-header" onClick={() => setPendingJoin(room)}>
                  <span className="voice-room-list-card-icon">
                    <DynamicIcon name="radio" size={20} />
                  </span>
                  <span className="voice-room-list-card-name">{room.name}</span>
                  <span className="voice-room-preview-count">
                    <DynamicIcon name="users" size={13} />
                    {members.length}
                  </span>
                  <DynamicIcon name="chevron-left" size={16} className="voice-room-list-card-arrow" aria-hidden />
                </button>

                {members.length > 0 && (
                  <ul className="voice-room-preview-member-list">
                    {members.map((m) => (
                      <li key={m.userId}>
                        <button
                          type="button"
                          className={`voice-room-preview-member-row ${m.isAdmin ? 'is-admin' : ''}`}
                          onClick={() => setPendingJoin(room)}
                        >
                          <PreviewAvatar member={m} />
                          <span className="voice-room-preview-member-name">{m.username}</span>
                          {m.isAdmin && (
                            <span className="voice-room-sidebar-admin-badge">
                              <DynamicIcon name="crown" size={11} />
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
            setSelectedRoom(pendingJoin);
            setPendingJoin(null);
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getVoiceRooms, VoiceRoomSummary } from '@/services/api';
import { toast } from '@/utils/toast';
import { DynamicIcon } from '@/utils/icons';
import BackButton from '@/components/layout/BackButton';
import VoiceRoomView from '@/pages/voice-rooms/VoiceRoomView';

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
        غرف شات صوتية بدون مايك — تلاوة مُذاعة يشغّلها الأدمن يسمعها كل الأعضاء المتواجدين، مع شات نصي بينكم.
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
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className="list-card voice-room-list-card"
              onClick={() => setSelectedRoom(room)}
            >
              <span className="voice-room-list-card-icon">
                <DynamicIcon name="radio" size={20} />
              </span>
              <span className="voice-room-list-card-name">{room.name}</span>
              <DynamicIcon name="chevron-left" size={16} className="voice-room-list-card-arrow" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

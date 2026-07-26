import { useEffect, useState } from 'react';
import {
  AdminVoiceRoomEntry,
  getAdminVoiceRooms,
  createAdminVoiceRoom,
  deleteAdminVoiceRoom,
  grantVoiceRoomAccess,
  revokeVoiceRoomAccess,
} from '@/services/api';
import { sounds } from '@/services/audio/sounds';
import { toast } from '@/utils/toast';
import { DynamicIcon } from '@/utils/icons';
import ConfirmModal from '@/components/common/ConfirmModal';

// لوحة إدارة الغرف الصوتية: إنشاء/حذف غرف، ومنح/سحب صلاحية دخول لعضو
// معيّن بالاسم. الحالة الحيّة للغرفة (مين متواجد فيها دلوقتي، وهي شغّالة
// إيه) مش هنا — دي بتظهر جوه الغرفة نفسها وقت ما حد يفتحها فعليًا.
export default function AdminVoiceRoomsPanel() {
  const [rooms, setRooms] = useState<AdminVoiceRoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grantUsername, setGrantUsername] = useState<Record<string, string>>({});
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminVoiceRoomEntry | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getAdminVoiceRooms();
      setRooms(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل الغرف الصوتية');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const name = newRoomName.trim();
    if (!name) {
      toast.error('لازم تكتب اسم للغرفة الأول');
      return;
    }
    setCreating(true);
    try {
      const room = await createAdminVoiceRoom(name);
      setRooms((prev) => [room, ...prev]);
      setNewRoomName('');
      sounds.success();
      toast.success(`اتعملت غرفة "${room.name}"`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء الغرفة');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const room = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteAdminVoiceRoom(room.id);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      sounds.success();
      toast.success(`اتحذفت غرفة "${room.name}"`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الغرفة');
    }
  }

  async function handleGrant(roomId: string) {
    const username = (grantUsername[roomId] || '').trim();
    if (!username) {
      toast.error('اكتب اسم المستخدم الأول');
      return;
    }
    setGrantingId(roomId);
    try {
      const access = await grantVoiceRoomAccess(roomId, username);
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, members: [access, ...r.members] } : r))
      );
      setGrantUsername((prev) => ({ ...prev, [roomId]: '' }));
      sounds.success();
      toast.success(`اتضاف "${access.username}" لصلاحية دخول الغرفة`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر منح الصلاحية');
    } finally {
      setGrantingId(null);
    }
  }

  async function handleRevoke(roomId: string, userId: string, username: string) {
    try {
      await revokeVoiceRoomAccess(roomId, userId);
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, members: r.members.filter((m) => m.userId !== userId) } : r))
      );
      sounds.click();
      toast.info(`اتسحبت صلاحية "${username}"`);
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر سحب الصلاحية');
    }
  }

  return (
    <div className="admin-voice-rooms-panel">
      <div className="admin-section-header">
        <h2>الغرف الصوتية</h2>
      </div>
      <p className="modal-hint" style={{ marginBottom: 12 }}>
        أنشئ غرفة وامنح صلاحية دخولها لأعضاء معيّنين بالاسم. جوه الغرفة، أي أدمن يقدر يكتب
        <code style={{ margin: '0 4px' }}>شغل ...</code>
        في الشات وتشتغل تلاوة من مشغّل القرآن لكل الأعضاء المتواجدين.
      </p>

      <div className="admin-form voice-room-create-form">
        <input
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          placeholder="اسم الغرفة الجديدة"
          maxLength={60}
        />
        <button className="small" type="button" onClick={handleCreate} disabled={creating || !newRoomName.trim()}>
          <DynamicIcon name="plus" size={14} />
          إنشاء غرفة
        </button>
      </div>

      {loading ? (
        <div className="music-results">
          <div className="skeleton skeleton-card music-skeleton-card" />
          <div className="skeleton skeleton-card music-skeleton-card" />
        </div>
      ) : rooms.length === 0 ? (
        <p className="empty">
          <DynamicIcon name="radio" size={32} className="empty-icon" />
          مفيش غرف صوتية لسه
          <br />
          أنشئ أول غرفة من الفورم اللي فوق
        </p>
      ) : (
        <div className="voice-room-admin-list">
          {rooms.map((room) => {
            const expanded = expandedId === room.id;
            return (
              <div key={room.id} className="list-card voice-room-admin-card">
                <button
                  type="button"
                  className="voice-room-admin-card-header"
                  onClick={() => setExpandedId(expanded ? null : room.id)}
                >
                  <span className="voice-room-admin-card-name">
                    <DynamicIcon name="radio" size={16} />
                    {room.name}
                  </span>
                  <span className="voice-room-admin-card-meta">
                    <DynamicIcon name="users" size={13} />
                    {room.members.length}
                  </span>
                  <DynamicIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
                </button>

                {expanded && (
                  <div className="voice-room-admin-card-body">
                    <div className="admin-form voice-room-grant-form">
                      <input
                        value={grantUsername[room.id] || ''}
                        onChange={(e) => setGrantUsername((prev) => ({ ...prev, [room.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleGrant(room.id);
                        }}
                        placeholder="اسم المستخدم اللي هيدخل الغرفة"
                      />
                      <button
                        className="small"
                        type="button"
                        onClick={() => handleGrant(room.id)}
                        disabled={grantingId === room.id}
                      >
                        <DynamicIcon name="user" size={14} />
                        منح صلاحية دخول
                      </button>
                    </div>

                    {room.members.length === 0 ? (
                      <p className="empty" style={{ padding: '12px 0' }}>
                        مفيش حد معاه صلاحية دخول لسه
                      </p>
                    ) : (
                      <ul className="voice-room-member-list">
                        {room.members.map((m) => (
                          <li key={m.userId} className="voice-room-member-row">
                            <span>
                              <DynamicIcon name="user" size={13} />
                              {m.username}
                              {m.grantedByUsername && (
                                <span className="voice-room-member-granted-by"> — سمحله {m.grantedByUsername}</span>
                              )}
                            </span>
                            <button
                              type="button"
                              className="icon-btn small"
                              onClick={() => handleRevoke(room.id, m.userId, m.username)}
                              aria-label="سحب الصلاحية"
                              title="سحب الصلاحية"
                            >
                              <DynamicIcon name="x" size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      className="danger small voice-room-delete-btn"
                      onClick={() => setPendingDelete(room)}
                    >
                      <DynamicIcon name="trash" size={14} />
                      حذف الغرفة
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="حذف الغرفة الصوتية"
          description={`هيتحذف كل شات وصلاحيات الدخول الخاصة بـ"${pendingDelete.name}" نهائيًا. متأكد؟`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

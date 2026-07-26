import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceRoomSocket, VoiceRoomMember } from '@/hooks/voiceRoomSocket';
import { useVoiceRoomAudioPlayer } from '@/hooks/voiceRoomAudioPlayer';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import { resolveAvatarUrl } from '@/services/api/profile';
import BackButton from '@/components/layout/BackButton';

// صورة عضو واحد في قايمة الأعضاء: صورة بروفايل حقيقية لو موجودة، وإلا دايرة
// متدرّجة بأول حرف من اسمه (بنفس روح صورة البروفايل في باقي الموقع) عشان
// محدش يفضل بأيقونة موحّدة زي كل الناس.
function MemberAvatar({ member, size = 34 }: { member: VoiceRoomMember; size?: number }) {
  const url = resolveAvatarUrl(member.avatarUrl);
  const initial = member.username.trim().charAt(0).toUpperCase() || '؟';
  return (
    <span
      className={`voice-room-member-avatar ${member.isAdmin ? 'is-admin' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initial}</span>}
      <span className="voice-room-member-online-dot" aria-hidden="true" />
    </span>
  );
}

// شاشة الغرفة الصوتية نفسها: قائمة الأعضاء المتواجدين، شات نصي حي، ومشغّل
// صوت مخفي بيشتغل تلقائيًا بالتلاوة اللي شغّلها الأدمن ومتزامن (تقريبًا)
// مع كل الأعضاء التانيين. مفيش مايك خالص هنا — الشات نص بس، والصوت اتجاه
// واحد من التلاوة المُذاعة لكل الأعضاء.
export default function VoiceRoomView({
  roomId,
  roomName,
  isAdmin,
  username,
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  roomId: string;
  roomName: string;
  isAdmin: boolean;
  username: string;
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const { status, errorMessage, messages, members, playback, sendMessage } = useVoiceRoomSocket(roomId);
  const { ready, needsUnmute, volume, setVolume, enableSound, containerId } = useVoiceRoomAudioPlayer(playback);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // قايمة الأعضاء دايمة الظهور جنب الشات (زي ديسكورد) — قابلة للطي/الفتح،
  // ومفتوحة بشكل افتراضي أول ما تدخل الغرفة.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // الأدمن يظهر الأول في القايمة (زي تجميع "المشرفين" في ديسكورد)، وبعدين
  // باقي الأعضاء بترتيب دخولهم للغرفة.
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)),
    [members],
  );
  const adminsCount = useMemo(() => members.filter((m) => m.isAdmin).length, [members]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (status === 'kicked') {
      sounds.error();
      toast.error('اتسحبت صلاحية دخولك للغرفة دي');
      onBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    const result = await sendMessage(text);
    setSending(false);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
      setDraft(text);
    }
  }

  return (
    <div className="container view-fade voice-room-page">
      {/* مشغّل يوتيوب مخفي (1×1 بيكسل) — بيستخدمه useVoiceRoomAudioPlayer
          لتشغيل صوت التلاوة المُذاعة، مش مقصود يظهر للمستخدم أبدًا. */}
      <div id={containerId} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong className="voice-room-title">{roomName}</strong>
          <button
            type="button"
            className="voice-room-members-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'إظهار قايمة الأعضاء' : 'إخفاء قايمة الأعضاء'}
          >
            <DynamicIcon name="users" size={15} />
            {members.length}
          </button>
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

      {status === 'connecting' && (
        <div className="voice-room-status-banner">
          <DynamicIcon name="loader" size={16} className="spin" />
          بيتم الاتصال بالغرفة...
        </div>
      )}

      {status === 'error' && (
        <div className="voice-room-status-banner voice-room-status-error">
          <DynamicIcon name="wifi-off" size={16} />
          {errorMessage || 'تعذّر الاتصال بالغرفة'}
        </div>
      )}

      {status === 'joined' && (
        <div className={`voice-room-body ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          <div className="voice-room-chat-col">
            {playback && (
              <div className="list-card voice-room-playback-card">
                {playback.thumbnail ? (
                  <img src={playback.thumbnail} alt="" className="voice-room-playback-thumb" />
                ) : (
                  <span className="voice-room-playback-thumb voice-room-playback-thumb-fallback" aria-hidden="true">
                    <DynamicIcon name="book-open" size={20} />
                  </span>
                )}
                <div className="voice-room-playback-info">
                  <strong>{playback.title}</strong>
                  <span>{playback.channel || 'تلاوة قرآنية'}</span>
                </div>
                {needsUnmute ? (
                  <button type="button" className="small voice-room-unmute-btn" onClick={enableSound}>
                    <DynamicIcon name="volume-high" size={14} />
                    دوس عشان تسمع
                  </button>
                ) : (
                  <div className="voice-room-volume-row">
                    <DynamicIcon name="volume-high" size={14} />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      aria-label="مستوى صوت التلاوة"
                      disabled={!ready}
                    />
                  </div>
                )}
              </div>
            )}

            {isAdmin && (
              <p className="modal-hint voice-room-admin-hint">
                اكتب <code>شغل</code> متبوعة باسم سورة أو قارئ في الشات عشان تشغّل تلاوة لكل المتواجدين.
              </p>
            )}

            <div className="voice-room-messages">
              {messages.length === 0 && (
                <p className="empty" style={{ padding: '24px 0' }}>
                  <DynamicIcon name="mic-off" size={28} className="empty-icon" />
                  لسه مفيش رسائل في الغرفة دي
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`voice-room-message ${m.isSystem ? 'system' : ''} ${
                    !m.isSystem && m.username === username ? 'own' : ''
                  }`}
                >
                  {!m.isSystem && (
                    <span className="voice-room-message-author">
                      {m.isAdmin && <DynamicIcon name="crown" size={11} />}
                      {m.username}
                    </span>
                  )}
                  <span className="voice-room-message-body">{m.body}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="voice-room-compose">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder="اكتب رسالة..."
                maxLength={500}
                aria-label="رسالة جديدة"
              />
              <button
                type="button"
                className="icon-btn voice-room-send-btn"
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                aria-label="إرسال"
                title="إرسال"
              >
                <DynamicIcon name="send" size={18} />
              </button>
            </div>
          </div>

          {/* قايمة الأعضاء دايمة الظهور جنب الشات — قابلة للطي لدايرة رفيعة
              بصور الأعضاء بس، أو الفتح الكامل بالاسم والحالة وشارة الأدمن. */}
          <aside className={`voice-room-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="الأعضاء المتواجدين">
            <button
              type="button"
              className="voice-room-sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'فتح قايمة الأعضاء' : 'طي قايمة الأعضاء'}
            >
              <DynamicIcon name={sidebarCollapsed ? 'chevron-left' : 'chevron-right'} size={14} />
            </button>

            {!sidebarCollapsed && (
              <div className="voice-room-sidebar-header">
                <span className="voice-room-sidebar-title">
                  <DynamicIcon name="users" size={14} />
                  الأعضاء — {members.length}
                </span>
                {adminsCount > 0 && (
                  <span className="voice-room-sidebar-admins-count">
                    <DynamicIcon name="crown" size={11} />
                    {adminsCount}
                  </span>
                )}
              </div>
            )}

            <ul className="voice-room-sidebar-list">
              {sortedMembers.length === 0 && !sidebarCollapsed && (
                <li className="voice-room-sidebar-empty">مفيش حد متواجد دلوقتي</li>
              )}
              {sortedMembers.map((m) => (
                <li key={m.userId} className={`voice-room-sidebar-row ${m.isAdmin ? 'is-admin' : ''}`} title={m.username}>
                  <MemberAvatar member={m} size={sidebarCollapsed ? 30 : 34} />
                  {!sidebarCollapsed && (
                    <span className="voice-room-sidebar-name">
                      {m.username}
                      {m.isAdmin && (
                        <span className="voice-room-sidebar-admin-badge">
                          <DynamicIcon name="crown" size={11} />
                        </span>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

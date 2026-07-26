import { useEffect, useRef, useState } from 'react';
import { useVoiceRoomSocket } from '@/hooks/voiceRoomSocket';
import { useVoiceRoomAudioPlayer } from '@/hooks/voiceRoomAudioPlayer';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import BackButton from '@/components/layout/BackButton';

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
  const [membersOpen, setMembersOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
            onClick={() => setMembersOpen((v) => !v)}
            aria-expanded={membersOpen}
            title="الأعضاء المتواجدين"
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

      {membersOpen && (
        <div className="list-card voice-room-members-panel">
          {members.length === 0 ? (
            <p className="empty" style={{ padding: '8px 0' }}>
              مفيش حد متواجد دلوقتي
            </p>
          ) : (
            <ul className="voice-room-member-list">
              {members.map((m) => (
                <li key={m.userId} className="voice-room-member-row">
                  <span>
                    <DynamicIcon name={m.isAdmin ? 'crown' : 'user'} size={13} />
                    {m.username}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        <>
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
        </>
      )}
    </div>
  );
}

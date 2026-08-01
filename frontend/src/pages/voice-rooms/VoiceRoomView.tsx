import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceRoomSession } from '@/hooks/voiceRoomSession';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import VoiceRoomMemberTile from '@/components/voice-rooms/VoiceRoomMemberTile';
import VoiceRoomChatOverlay from '@/components/voice-rooms/VoiceRoomChatOverlay';
import RoomDurationTimer from '@/components/voice-rooms/RoomDurationTimer';
import VoiceRoomQuranControls from '@/components/voice-rooms/VoiceRoomQuranControls';

// ===== شاشة المكالمة الصوتية (زي ديسكورد بالظبط) =====
// شبكة مربعات للأعضاء المتواجدين، شريط علوي فيه اسم الغرفة ووصفها، شريط
// سفلي ثابت فيه: فتح/قفل السماعة (Deafen) — مفيش مايك خالص هنا زي ما
// اتّفقنا — وزرار الشات اللي بيفتح شاشة كاملة منفصلة (VoiceRoomChatOverlay)،
// وزرار الخروج الأحمر.
//
// مهم جدًا: زرار "رجوع" (السهم في الشريط العلوي) بيرجّع لقايمة الغرف بس
// من غير ما يسيب الغرفة فعليًا — بالظبط زي ما بيحصل في ديسكورد لما تصغّر
// شاشة المكالمة. العضو يفضل متواجد وبيسمع التلاوة وهو ماشي في باقي
// صفحات التطبيق. الحاجة الوحيدة اللي فعليًا بتسيب الغرفة هي الزرار
// الأحمر "خروج" في آخر الشريط السفلي. الاتصال والصوت نفسهم متحكم فيهم من
// VoiceRoomSessionProvider في main.tsx، مش من الشاشة دي — فمفيش أي تأثير
// على الصوت لو الشاشة دي اتقفلت (unmount) لأي سبب غير الخروج الصريح.
export default function VoiceRoomView({
  roomId,
  isAdmin,
  username,
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  roomId: string;
  isAdmin: boolean;
  username: string;
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const {
    status,
    errorMessage,
    roomName,
    roomDescription,
    messages,
    members,
    playback,
    queue,
    repeat,
    shuffle,
    chatLocked,
    sessionStartedAtMs,
    myRole,
    myMuted,
    sendMessage,
    uploadAttachment,
    toggleReaction,
    sendControl,
    pinMessage,
    deleteMessage,
    clearChat,
    toggleChatLock,
    leaveRoom,
    audioReady: ready,
    needsUnmute,
    volume,
    setVolume,
    enableSound,
    deafened,
    toggleDeafen,
  } = useVoiceRoomSession();

  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenCountRef = useRef(0);

  // "أدمن فعلي" جوه الغرفة دي: إما أدمن عام على التطبيق كله، أو عضو
  // اتترقّى "admin" جوه الغرفة دي بالذات بمعرفة أدمن عام (myRole جايه من
  // السيرفر وقت الانضمام، وبتتحدّث حي لو الأدمن غيّرها وهو متواجد).
  const effectiveIsAdmin = isAdmin || myRole === 'admin';
  const effectiveIsModerator = effectiveIsAdmin || myRole === 'moderator';

  // الأدمن يظهر الأول، وبعدين باقي الأعضاء بترتيب دخولهم للغرفة (الترتيب
  // بييجي من السيرفر أصلًا حسب وقت الانضمام).
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin)),
    [members],
  );

  useEffect(() => {
    if (chatOpen) {
      lastSeenCountRef.current = messages.length;
      setUnreadCount(0);
    } else {
      setUnreadCount(Math.max(0, messages.length - lastSeenCountRef.current));
    }
  }, [messages.length, chatOpen]);

  useEffect(() => {
    if (status === 'kicked') {
      sounds.error();
      toast.error('اتسحبت صلاحية دخولك للغرفة دي');
      onBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleSend(text: string, options?: { attachment?: any; replyToId?: string | null }) {
    const result = await sendMessage(text, options);
    return result;
  }

  // رجوع لقايمة الغرف من غير ما نسيب الغرفة — الاتصال والصوت فاضلين شغالين.
  function handleMinimize() {
    sounds.click();
    onBack();
  }

  // خروج فعلي من الغرفة الصوتية — بيقفل الاتصال والصوت فورًا.
  function handleLeave() {
    sounds.click();
    leaveRoom();
    onBack();
  }

  if (chatOpen && status === 'joined') {
    return (
      <VoiceRoomChatOverlay
        roomName={roomName}
        messages={messages}
        username={username}
        isAdmin={effectiveIsModerator}
        myMuted={myMuted}
        chatLocked={chatLocked}
        onClose={() => setChatOpen(false)}
        onSend={handleSend}
        onUploadAttachment={uploadAttachment}
        onToggleReaction={toggleReaction}
        onPinMessage={pinMessage}
        onDeleteMessage={deleteMessage}
        onClearChat={clearChat}
        onToggleChatLock={toggleChatLock}
      />
    );
  }

  return (
    <div className="container view-fade voice-room-call-page">
      <div className="top-bar voice-room-call-topbar">
        <div className="top-bar-main">
          <button
            type="button"
            className="icon-btn voice-room-back-btn"
            onClick={handleMinimize}
            aria-label="رجوع لقايمة الغرف"
            title="رجوع (تفضل متواجد وبتسمع)"
          >
            <DynamicIcon name="chevron-right" size={20} />
          </button>
          <span className="voice-room-call-heading">
            <span className="voice-room-call-icon">
              <DynamicIcon name="radio" size={16} />
            </span>
            <span className="voice-room-call-heading-text">
              <strong className="voice-room-title">{roomName}</strong>
              {roomDescription && <span className="voice-room-call-desc">{roomDescription}</span>}
            </span>
          </span>
          <div className="voice-room-call-topbar-actions">
            <RoomDurationTimer startedAtMs={sessionStartedAtMs} size="md" />
            <span className="voice-room-members-toggle" title="عدد الأعضاء المتواجدين">
              <DynamicIcon name="users" size={14} />
              {members.length}
            </span>
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
      </div>

      {(status === 'connecting' || status === 'idle') && (
        <div className="voice-room-callgrid-loading">
          <div className="skeleton voice-room-tile-skeleton" />
          <div className="skeleton voice-room-tile-skeleton" />
          <div className="skeleton voice-room-tile-skeleton" />
          <div className="skeleton voice-room-tile-skeleton" />
          <p className="voice-room-connecting-hint">
            <DynamicIcon name="loader" size={16} className="spin" />
            بيتم الاتصال بالغرفة...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="empty voice-room-error-state">
          <DynamicIcon name="wifi-off" size={32} className="empty-icon" />
          {errorMessage || 'تعذّر الاتصال بالغرفة'}
          <br />
          <button type="button" className="small" onClick={onBack}>
            <DynamicIcon name="chevron-right" size={14} />
            رجوع
          </button>
        </div>
      )}

      {status === 'joined' && (
        <>
          {playback && (
            <div className="voice-room-nowplaying-bar">
              {playback.thumbnail ? (
                <img src={playback.thumbnail} alt="" className="voice-room-nowplaying-thumb" />
              ) : (
                <span className="voice-room-nowplaying-thumb voice-room-nowplaying-thumb-fallback" aria-hidden="true">
                  <DynamicIcon name="book-open" size={18} />
                </span>
              )}
              <div className="voice-room-nowplaying-info">
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

          {effectiveIsAdmin && (
            <VoiceRoomQuranControls
              playback={playback}
              queue={queue}
              repeat={repeat}
              shuffle={shuffle}
              volume={volume}
              onControl={sendControl}
            />
          )}

          <div className="voice-room-callgrid">
            {sortedMembers.length === 0 ? (
              <p className="empty" style={{ padding: '32px 0' }}>
                <DynamicIcon name="mic-off" size={28} className="empty-icon" />
                مفيش حد متواجد دلوقتي
              </p>
            ) : (
              sortedMembers.map((m) => <VoiceRoomMemberTile key={m.userId} member={m} isBot={m.isBot} />)
            )}
          </div>
        </>
      )}

      {myMuted && status === 'joined' && (
        <p className="voice-room-muted-banner">
          <DynamicIcon name="mic-off" size={13} />
          انت مكتوم من الشات في الغرفة دي حاليًا
        </p>
      )}

      {status === 'joined' && (
        <div className="voice-room-callbar">
          <button
            type="button"
            className={`voice-room-callbar-btn ${deafened ? 'is-active-danger' : ''}`}
            onClick={toggleDeafen}
            aria-pressed={!deafened}
            title={deafened ? 'السماعة مقفولة — دوس عشان تسمع' : 'السماعة مفتوحة — دوس عشان تقفلها'}
          >
            <DynamicIcon name={deafened ? 'volume-off' : 'headphones'} size={20} />
            <span>{deafened ? 'مقفولة' : 'السماعة'}</span>
          </button>

          <button
            type="button"
            className="voice-room-callbar-btn voice-room-callbar-chat-btn"
            onClick={() => setChatOpen(true)}
            title="فتح الشات"
          >
            <DynamicIcon name="message-circle" size={20} />
            <span>الشات</span>
            {unreadCount > 0 && <span className="voice-room-chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          <button
            type="button"
            className="voice-room-callbar-btn voice-room-callbar-leave-btn"
            onClick={handleLeave}
            title="الخروج من الغرفة"
          >
            <DynamicIcon name="phone-off" size={20} />
            <span>خروج</span>
          </button>
        </div>
      )}
    </div>
  );
}

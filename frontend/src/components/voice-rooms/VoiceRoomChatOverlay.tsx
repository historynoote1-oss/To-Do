// ===== شات الغرفة الصوتية — شاشة كاملة منفصلة =====
// بتتفتح بشاشة كاملة فوق شاشة المكالمة (grid الأعضاء) لما تدوس على أيقونة
// الشات في الشريط السفلي، وبتتقفل بأيقونة X فوق ترجعك لنفس شاشة المكالمة
// (مش بتقطعك من الغرفة خالص — لسه سامع التلاوة وموجود). فيه دعم لتثبيت/حذف
// الرسائل (الأدمن)، قفل الشات، ومنشن (@اسم) بيتلوّن جوه الرسايل. المرفقات
// (صور/ملفات/رسائل صوتية) هتتضاف في مرحلة تالية.

import { useEffect, useRef, useState } from 'react';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import { resolveAvatarUrl } from '@/services/api/profile';
import type { VoiceRoomMessage } from '@/hooks/voiceRoomSession';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// بيقسّم نص الرسالة لأجزاء عادية وأجزاء منشن (@اسم) عشان نلوّن المنشن بس.
function renderBodyWithMentions(body: string, mentions: string[] | undefined, own: boolean) {
  if (!mentions || mentions.length === 0) return body;
  const pattern = new RegExp(`@(${mentions.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = body.split(pattern);
  return parts.map((part, i) =>
    mentions.includes(part) ? (
      <span key={i} className={`voice-room-mention ${own ? 'own' : ''}`}>
        @{part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function VoiceRoomChatOverlay({
  roomName,
  messages,
  username,
  isAdmin,
  chatLocked,
  onClose,
  onSend,
  onPinMessage,
  onDeleteMessage,
  onClearChat,
  onToggleChatLock,
}: {
  roomName: string;
  messages: VoiceRoomMessage[];
  username: string;
  isAdmin: boolean;
  chatLocked: boolean;
  onClose: () => void;
  onSend: (text: string) => Promise<{ error?: string }>;
  onPinMessage: (messageId: string, pinned: boolean) => Promise<{ error?: string }>;
  onDeleteMessage: (messageId: string) => Promise<{ error?: string }>;
  onClearChat: () => Promise<{ error?: string }>;
  onToggleChatLock: (locked: boolean) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const pinnedMessage = [...messages].reverse().find((m) => m.isPinned && !m.isDeleted);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    if (chatLocked && !isAdmin) {
      sounds.error();
      toast.error('الشات مقفول دلوقتي من الأدمن');
      return;
    }
    setSending(true);
    setDraft('');
    const result = await onSend(text);
    setSending(false);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
      setDraft(text);
    }
  }

  async function handlePinToggle(m: VoiceRoomMessage) {
    setOpenMenuId(null);
    const result = await onPinMessage(m.id, !m.isPinned);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
    } else {
      sounds.success();
    }
  }

  async function handleDelete(m: VoiceRoomMessage) {
    setOpenMenuId(null);
    const result = await onDeleteMessage(m.id);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
    }
  }

  async function handleToggleLock() {
    const result = await onToggleChatLock(!chatLocked);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
    }
  }

  async function handleClearChat() {
    if (!window.confirm('هتمسح كل رسائل الشات دي؟ الإجراء ده مش هينفع يترجع.')) return;
    const result = await onClearChat();
    if (result.error) {
      sounds.error();
      toast.error(result.error);
    } else {
      sounds.success();
    }
  }

  return (
    <div className="voice-room-chat-overlay view-fade">
      <div className="top-bar voice-room-chat-overlay-topbar">
        <div className="top-bar-main">
          <strong className="voice-room-title">{roomName} — الشات</strong>
          <div className="voice-room-chat-topbar-actions">
            {isAdmin && (
              <>
                <button
                  type="button"
                  className={`icon-btn ${chatLocked ? 'is-active-danger' : ''}`}
                  onClick={handleToggleLock}
                  aria-label={chatLocked ? 'فتح الشات' : 'قفل الشات'}
                  title={chatLocked ? 'الشات مقفول — دوس عشان تفتحه' : 'قفل الشات'}
                >
                  <DynamicIcon name={chatLocked ? 'lock' : 'unlock'} size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={handleClearChat}
                  aria-label="مسح كل رسائل الشات"
                  title="مسح الشات"
                >
                  <DynamicIcon name="trash-2" size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn voice-room-chat-close-btn"
              onClick={onClose}
              aria-label="قفل الشات والرجوع للمكالمة"
              title="قفل"
            >
              <DynamicIcon name="x" size={20} />
            </button>
          </div>
        </div>
      </div>

      {chatLocked && (
        <p className="voice-room-chat-locked-banner">
          <DynamicIcon name="lock" size={14} />
          الشات مقفول دلوقتي من الأدمن
        </p>
      )}

      {pinnedMessage && (
        <div className="voice-room-pinned-banner">
          <DynamicIcon name="pin" size={14} />
          <span className="voice-room-pinned-banner-text">
            <strong>{pinnedMessage.username}:</strong> {pinnedMessage.body}
          </span>
        </div>
      )}

      {isAdmin && (
        <p className="modal-hint voice-room-admin-hint">
          اكتب <code>شغل</code> متبوعة باسم سورة أو قارئ في الشات عشان تشغّل تلاوة لكل المتواجدين.
        </p>
      )}

      <div className="voice-room-messages voice-room-messages-fullscreen">
        {messages.length === 0 && (
          <p className="empty" style={{ padding: '24px 0' }}>
            <DynamicIcon name="message-circle" size={28} className="empty-icon" />
            لسه مفيش رسائل في الغرفة دي
            <br />
            ابدأ الكلام مع باقي الأعضاء
          </p>
        )}
        {messages.map((m) => {
          const own = !m.isSystem && m.username === username;
          const avatarUrl = resolveAvatarUrl((m as any).avatarUrl ?? null);
          const mentioned = !m.isSystem && (m.mentions || []).includes(username);
          const canDelete = !m.isSystem && !m.isDeleted && (isAdmin || own);
          const canPin = isAdmin && !m.isSystem && !m.isDeleted;
          return (
            <div
              key={m.id}
              className={`voice-room-message ${m.isSystem ? 'system' : ''} ${own ? 'own' : ''} ${
                mentioned ? 'mentioned' : ''
              } ${m.isPinned ? 'pinned' : ''}`}
            >
              {!m.isSystem && (
                <span className="voice-room-message-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">{m.username.trim().charAt(0).toUpperCase() || '؟'}</span>
                  )}
                </span>
              )}
              <div className="voice-room-message-bubble">
                {!m.isSystem && (
                  <span className="voice-room-message-author">
                    {m.isAdmin && <DynamicIcon name="crown" size={11} />}
                    {m.username}
                    <span className="voice-room-message-time">{formatTime(m.createdAt)}</span>
                    {m.isPinned && <DynamicIcon name="pin" size={11} className="voice-room-message-pin-icon" />}
                  </span>
                )}
                {m.isDeleted ? (
                  <span className="voice-room-message-body voice-room-message-deleted">
                    <DynamicIcon name="trash-2" size={12} />
                    تم حذف الرسالة دي
                  </span>
                ) : (
                  <span className="voice-room-message-body">{renderBodyWithMentions(m.body, m.mentions, own)}</span>
                )}

                {(canPin || canDelete) && (
                  <div className="voice-room-message-actions">
                    <button
                      type="button"
                      className="icon-btn voice-room-message-menu-btn"
                      onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                      aria-label="خيارات الرسالة"
                      title="خيارات"
                    >
                      <DynamicIcon name="more-vertical" size={14} />
                    </button>
                    {openMenuId === m.id && (
                      <div className="voice-room-message-menu">
                        {canPin && (
                          <button type="button" onClick={() => handlePinToggle(m)}>
                            <DynamicIcon name="pin" size={13} />
                            {m.isPinned ? 'فك التثبيت' : 'تثبيت الرسالة'}
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="danger" onClick={() => handleDelete(m)}>
                            <DynamicIcon name="trash-2" size={13} />
                            حذف الرسالة
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="voice-room-compose">
        <button
          type="button"
          className="icon-btn voice-room-attach-btn"
          onClick={() => toast.info('إرسال الصور والملفات جاية قريب')}
          aria-label="إرفاق ملف"
          title="إرفاق"
        >
          <DynamicIcon name="paperclip" size={18} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder={chatLocked && !isAdmin ? 'الشات مقفول دلوقتي...' : 'اكتب رسالة...'}
          maxLength={500}
          aria-label="رسالة جديدة"
          disabled={chatLocked && !isAdmin}
        />
        <button
          type="button"
          className="icon-btn voice-room-send-btn"
          onClick={handleSend}
          disabled={!draft.trim() || sending || (chatLocked && !isAdmin)}
          aria-label="إرسال"
          title="إرسال"
        >
          <DynamicIcon name={sending ? 'loader' : 'send'} size={18} className={sending ? 'spin' : ''} />
        </button>
      </div>
    </div>
  );
}

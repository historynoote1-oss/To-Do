// ===== شات الغرفة الصوتية — شاشة كاملة منفصلة =====
// بتتفتح بشاشة كاملة فوق شاشة المكالمة (grid الأعضاء) لما تدوس على أيقونة
// الشات في الشريط السفلي، وبتتقفل بأيقونة X فوق ترجعك لنفس شاشة المكالمة
// (مش بتقطعك من الغرفة خالص — لسه سامع التلاوة وموجود).
//
// المميزات هنا: تثبيت/حذف الرسائل (الأدمن/المشرف)، قفل الشات، منشن (@اسم)
// بيتلوّن جوه الرسايل مع توست لو حد عملك منشن، مرفقات (صورة/فيديو/رسالة
// صوتية/ملف)، رد على رسالة معيّنة، وتفاعلات (إيموجي) على أي رسالة.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DynamicIcon } from '@/utils/icons';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import { resolveAvatarUrl } from '@/services/api/profile';
import type { VoiceRoomAttachment, VoiceRoomMessage } from '@/hooks/voiceRoomSession';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatBytes(size: number | null | undefined): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} ك.ب`;
  return `${(size / (1024 * 1024)).toFixed(1)} م.ب`;
}

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

function AttachmentPreview({ attachment }: { attachment: VoiceRoomAttachment }) {
  if (attachment.type === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="voice-room-attachment voice-room-attachment-image">
        <img src={attachment.url} alt={attachment.name || 'مرفق'} loading="lazy" />
      </a>
    );
  }
  if (attachment.type === 'video') {
    return (
      <video className="voice-room-attachment voice-room-attachment-video" src={attachment.url} controls playsInline preload="metadata" />
    );
  }
  if (attachment.type === 'audio') {
    return (
      <div className="voice-room-attachment voice-room-attachment-audio">
        <DynamicIcon name="music-2" size={16} />
        <audio src={attachment.url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="voice-room-attachment voice-room-attachment-file">
      <DynamicIcon name="file-text" size={18} />
      <span className="voice-room-attachment-file-info">
        <span className="voice-room-attachment-file-name">{attachment.name || 'ملف مرفق'}</span>
        {attachment.size ? <span className="voice-room-attachment-file-size">{formatBytes(attachment.size)}</span> : null}
      </span>
      <DynamicIcon name="download" size={16} />
    </a>
  );
}

export default function VoiceRoomChatOverlay({
  roomName,
  messages,
  username,
  isAdmin,
  myMuted = false,
  chatLocked,
  onClose,
  onSend,
  onUploadAttachment,
  onToggleReaction,
  onPinMessage,
  onDeleteMessage,
  onClearChat,
  onToggleChatLock,
}: {
  roomName: string;
  messages: VoiceRoomMessage[];
  username: string;
  isAdmin: boolean;
  myMuted?: boolean;
  chatLocked: boolean;
  onClose: () => void;
  onSend: (text: string, options?: { attachment?: VoiceRoomAttachment | null; replyToId?: string | null }) => Promise<{ error?: string }>;
  onUploadAttachment: (file: File) => Promise<{ attachment?: VoiceRoomAttachment; error?: string }>;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onPinMessage: (messageId: string, pinned: boolean) => Promise<{ error?: string }>;
  onDeleteMessage: (messageId: string) => Promise<{ error?: string }>;
  onClearChat: () => Promise<{ error?: string }>;
  onToggleChatLock: (locked: boolean) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<VoiceRoomAttachment | null>(null);
  const [replyTarget, setReplyTarget] = useState<VoiceRoomMessage | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = !chatLocked || isAdmin;
  const disabledInput = !canSend || myMuted;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const pinnedMessage = useMemo(() => [...messages].reverse().find((m) => m.isPinned && !m.isDeleted), [messages]);

  function scrollToMessage(id: string) {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('voice-room-message-flash');
    setTimeout(() => el.classList.remove('voice-room-message-flash'), 1200);
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      sounds.error();
      toast.error('الملف كبير جدًا (الحد الأقصى 25 ميجا)');
      return;
    }
    setUploading(true);
    const result = await onUploadAttachment(file);
    setUploading(false);
    if (result.error || !result.attachment) {
      sounds.error();
      toast.error(result.error || 'تعذّر رفع الملف');
      return;
    }
    setPendingAttachment(result.attachment);
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && !pendingAttachment) || sending || uploading) return;
    if (disabledInput) {
      sounds.error();
      toast.error(myMuted ? 'انت مكتوم من الشات جوه الغرفة دي' : 'الشات مقفول دلوقتي من الأدمن');
      return;
    }
    setSending(true);
    const attachment = pendingAttachment;
    const replyToId = replyTarget?.id || null;
    setDraft('');
    setPendingAttachment(null);
    setReplyTarget(null);
    const result = await onSend(text, { attachment, replyToId });
    setSending(false);
    if (result.error) {
      sounds.error();
      toast.error(result.error);
      setDraft(text);
      setPendingAttachment(attachment);
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

  function handleReply(m: VoiceRoomMessage) {
    setOpenMenuId(null);
    setReplyTarget(m);
  }

  function handleReact(messageId: string, emoji: string) {
    setReactionPickerId(null);
    onToggleReaction(messageId, emoji);
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

      {!chatLocked && myMuted && (
        <p className="voice-room-chat-locked-banner">
          <DynamicIcon name="mic-off" size={14} />
          انت مكتوم من الشات في الغرفة دي
        </p>
      )}

      {pinnedMessage && (
        <button type="button" className="voice-room-pinned-banner" onClick={() => scrollToMessage(pinnedMessage.id)}>
          <DynamicIcon name="pin" size={14} />
          <span className="voice-room-pinned-banner-text">
            <strong>{pinnedMessage.username}:</strong> {pinnedMessage.body || 'مرفق'}
          </span>
        </button>
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
          const canReply = !m.isSystem && !m.isDeleted;
          const reactions = m.reactions || [];
          return (
            <div
              key={m.id}
              ref={(el) => {
                messageRefs.current[m.id] = el;
              }}
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

                {m.replyTo && !m.isDeleted && (
                  <button type="button" className="voice-room-reply-preview" onClick={() => scrollToMessage(m.replyTo!.id)}>
                    <DynamicIcon name="reply" size={12} />
                    <span className="voice-room-reply-preview-text">
                      <strong>{m.replyTo.isSystem ? 'النظام' : m.replyTo.username}</strong>:{' '}
                      {m.replyTo.isDeleted ? 'رسالة محذوفة' : m.replyTo.body || 'مرفق'}
                    </span>
                  </button>
                )}

                {m.isDeleted ? (
                  <span className="voice-room-message-body voice-room-message-deleted">
                    <DynamicIcon name="trash-2" size={12} />
                    تم حذف الرسالة دي
                  </span>
                ) : (
                  <>
                    {m.body && <span className="voice-room-message-body">{renderBodyWithMentions(m.body, m.mentions, own)}</span>}
                    {m.attachment && <AttachmentPreview attachment={m.attachment} />}
                  </>
                )}

                {!m.isDeleted && reactions.length > 0 && (
                  <div className="voice-room-reactions-row">
                    {reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        className={`voice-room-reaction-chip ${r.mine.includes(username) ? 'mine' : ''}`}
                        onClick={() => onToggleReaction(m.id, r.emoji)}
                      >
                        <span>{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!m.isSystem && !m.isDeleted && (
                  <div className="voice-room-message-actions">
                    <button
                      type="button"
                      className="icon-btn voice-room-message-menu-btn"
                      onClick={() => setReactionPickerId(reactionPickerId === m.id ? null : m.id)}
                      aria-label="تفاعل"
                      title="تفاعل"
                    >
                      <DynamicIcon name="smile" size={14} />
                    </button>
                    {canReply && (
                      <button
                        type="button"
                        className="icon-btn voice-room-message-menu-btn"
                        onClick={() => handleReply(m)}
                        aria-label="رد"
                        title="رد"
                      >
                        <DynamicIcon name="reply" size={14} />
                      </button>
                    )}
                    {(canPin || canDelete) && (
                      <button
                        type="button"
                        className="icon-btn voice-room-message-menu-btn"
                        onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                        aria-label="خيارات الرسالة"
                        title="خيارات"
                      >
                        <DynamicIcon name="more-vertical" size={14} />
                      </button>
                    )}
                    {reactionPickerId === m.id && (
                      <div className="voice-room-reaction-picker">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => handleReact(m.id, emoji)}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
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

      {replyTarget && (
        <div className="voice-room-reply-bar">
          <DynamicIcon name="reply" size={14} />
          <span className="voice-room-reply-bar-text">
            رد على <strong>{replyTarget.username}</strong>: {replyTarget.body || 'مرفق'}
          </span>
          <button type="button" className="icon-btn" onClick={() => setReplyTarget(null)} aria-label="إلغاء الرد">
            <DynamicIcon name="x" size={14} />
          </button>
        </div>
      )}

      {pendingAttachment && (
        <div className="voice-room-pending-attachment">
          <AttachmentPreview attachment={pendingAttachment} />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPendingAttachment(null)}
            aria-label="إلغاء المرفق"
            title="إلغاء المرفق"
          >
            <DynamicIcon name="x" size={14} />
          </button>
        </div>
      )}

      <div className="voice-room-compose">
        <input ref={fileInputRef} type="file" hidden onChange={handlePickFile} accept="image/*,video/*,audio/*,.pdf" />
        <button
          type="button"
          className="icon-btn voice-room-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="إرفاق ملف"
          title="إرفاق"
          disabled={uploading || disabledInput}
        >
          <DynamicIcon name={uploading ? 'loader' : 'paperclip'} size={18} className={uploading ? 'spin' : ''} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder={disabledInput ? (myMuted ? 'انت مكتوم من الشات...' : 'الشات مقفول دلوقتي...') : 'اكتب رسالة...'}
          maxLength={500}
          aria-label="رسالة جديدة"
          disabled={disabledInput}
        />
        <button
          type="button"
          className="icon-btn voice-room-send-btn"
          onClick={handleSend}
          disabled={(!draft.trim() && !pendingAttachment) || sending || uploading || disabledInput}
          aria-label="إرسال"
          title="إرسال"
        >
          <DynamicIcon name={sending ? 'loader' : 'send'} size={18} className={sending ? 'spin' : ''} />
        </button>
      </div>
    </div>
  );
}

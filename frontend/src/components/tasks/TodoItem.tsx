import { useEffect, useRef, useState } from 'react';
import { PriorityBadge } from '@/components/life-areas/Priority';
import { DynamicIcon } from '@/lib/core/icons';
import { hapticImpact, hapticNotification } from '@/lib/core/nativeShell';
import { prefersReducedMotion } from '@/lib/core/motion';

// مسافة السحب (px) اللازمة عشان الإجراء يتفعّل فعليًا عند الإفلات —
// نفس فكرة TRIGGER_DISTANCE في PullToRefresh.tsx (المرحلة 4).
const SWIPE_TRIGGER = 76;
const SWIPE_MAX = 108;

export default function TodoItemRow({
  item,
  onToggle,
  onDelete,
  onPriorityChange,
  onEdit,
  onOpenReminders,
  delay = 0,
  leaving = false,
  simple = false,
}: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const inputRef = useRef<HTMLInputElement>(null);

  // ===== سحب المهمة الفرعية لإجراء سريع (المرحلة 4 — Motion) =====
  // سحب لليمين (dragX موجب) = إتمام/إلغاء إتمام فوري. سحب لليسار (dragX
  // سالب) = طلب حذف (بيفتح نفس مودال التأكيد العادي عن طريق onDelete،
  // مفيش حذف فوري بدون تأكيد). بيتلغي تمامًا لو "تقليل الحركة" مفعّل.
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const axisLockRef = useRef<'x' | 'y' | null>(null);
  const triggeredRef = useRef<null | 'left' | 'right'>(null);
  const reduceMotion = prefersReducedMotion();

  function onSwipeStart(e: React.TouchEvent) {
    if (simple || editing || reduceMotion) return;
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
    axisLockRef.current = null;
    triggeredRef.current = null;
  }

  function onSwipeMove(e: React.TouchEvent) {
    if (!swipeStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    if (axisLockRef.current === null) {
      // مفيش قرار اتجاه لسه — لو الحركة الرأسية أوضح نسيب السكرول العادي
      // يشتغل ومنقفلش على السحب الأفقي.
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLockRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axisLockRef.current === 'y') return;
    e.preventDefault();
    setSwiping(true);
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    setDragX(clamped);
    const dir = clamped > 0 ? 'right' : clamped < 0 ? 'left' : null;
    if (dir && Math.abs(clamped) >= SWIPE_TRIGGER && triggeredRef.current !== dir) {
      triggeredRef.current = dir;
      void hapticImpact('medium');
    } else if (!dir || Math.abs(clamped) < SWIPE_TRIGGER) {
      triggeredRef.current = null;
    }
  }

  function onSwipeEnd() {
    if (!swipeStartRef.current) return;
    swipeStartRef.current = null;
    const dir = triggeredRef.current;
    setSwiping(false);
    setDragX(0);
    axisLockRef.current = null;
    triggeredRef.current = null;
    if (dir === 'right') {
      void hapticNotification('success');
      onToggle();
    } else if (dir === 'left') {
      void hapticNotification('warning');
      onDelete();
    }
  }

  useEffect(() => {
    if (editing) {
      setDraft(item.content);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]);

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.content) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await onEdit(trimmed);
  }

  function cancel() {
    setDraft(item.content);
    setEditing(false);
  }

  // وضع "عرض بس" — بيُستخدم في نافذة "المهام الفرعية" اللي بتتفتح من
  // أيقونة العرض في الكارت الرئيسي: Check + اسم المهمة الفرعية بس، من
  // غير شارة أولوية أو موعد استحقاق أو أي زرار تعديل/حذف/تذكيرات.
  if (simple) {
    return (
      <li
        className={`${item.isDone ? 'done' : ''} ${leaving ? 'leaving' : ''}`}
        style={{ ['--delay' as any]: `${delay}ms` }}
      >
        <label>
          <span
            className={`checkbox ${item.isDone ? 'checked' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              onToggle();
            }}
          >
            <svg viewBox="0 0 16 16">
              <polyline points="3,9 6.5,12.5 13,4" />
            </svg>
          </span>
          <span>{item.content}</span>
        </label>
      </li>
    );
  }

  const swipeReady = !simple && !editing && !reduceMotion;

  return (
    <li
      className={`${item.isDone ? 'done' : ''} ${leaving ? 'leaving' : ''} ${editing ? 'editing' : ''} ${swipeReady ? 'swipeable-row' : ''}`}
      style={{ ['--delay' as any]: `${delay}ms` }}
    >
      {swipeReady && (
        <div className="swipe-bg" aria-hidden="true">
          <span className={`swipe-bg-side swipe-bg-complete ${dragX > SWIPE_TRIGGER ? 'active' : ''}`}>
            <DynamicIcon name="check" size={16} />
          </span>
          <span className={`swipe-bg-side swipe-bg-delete ${dragX < -SWIPE_TRIGGER ? 'active' : ''}`}>
            <DynamicIcon name="x" size={16} />
          </span>
        </div>
      )}
      <div
        className="swipe-content"
        style={
          swipeReady
            ? { transform: `translateX(${dragX}px)`, transition: swiping ? 'none' : 'transform 200ms var(--ease-out)' }
            : undefined
        }
        onTouchStart={swipeReady ? onSwipeStart : undefined}
        onTouchMove={swipeReady ? onSwipeMove : undefined}
        onTouchEnd={swipeReady ? onSwipeEnd : undefined}
        onTouchCancel={swipeReady ? onSwipeEnd : undefined}
      >
        {editing ? (
          <div className="row-edit-form">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') cancel();
              }}
              onBlur={commit}
              autoFocus
            />
          </div>
        ) : (
          <label>
            <span
              className={`checkbox ${item.isDone ? 'checked' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onToggle();
              }}
            >
              <svg viewBox="0 0 16 16">
                <polyline points="3,9 6.5,12.5 13,4" />
              </svg>
            </span>
            <span onDoubleClick={startEdit}>{item.content}</span>
          </label>
        )}
        {!editing && (
          <div className="row-actions">
            {onPriorityChange && (
              <PriorityBadge value={item.priority || 'NONE'} onChange={onPriorityChange} size="sm" />
            )}
            {item.dueDate && (
              <span className="due-date-chip" title="موعد الاستحقاق">
                <DynamicIcon name="calendar" size={12} /> {new Date(item.dueDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            {onOpenReminders && (
              <button
                className={`icon-btn small reminder-bell ${item._count?.reminders ? 'has-reminders' : ''}`}
                onClick={() => onOpenReminders(item)}
                aria-label="تذكيرات المهمة الفرعية"
                type="button"
                title="التذكيرات"
              >
                <DynamicIcon name="bell" size={13} />
                {item._count?.reminders > 0 && <span className="reminder-count-badge">{item._count.reminders}</span>}
              </button>
            )}
            {onEdit && (
              <button className="icon-btn small row-edit" onClick={startEdit} aria-label="تعديل المهمة الفرعية" type="button">
                <DynamicIcon name="pencil" size={13} />
              </button>
            )}
            <button className="danger small row-delete" onClick={onDelete} aria-label="حذف المهمة الفرعية" type="button">
              <DynamicIcon name="x" size={13} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

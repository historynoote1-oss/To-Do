import { useRef, useState } from 'react';
import { DynamicIcon } from '../lib/icons';
import { hapticImpact, hapticNotification } from '../lib/nativeShell';
import { prefersReducedMotion } from '../lib/motion';

const TRIGGER_DISTANCE = 72; // مسافة السحب (px) اللازمة عشان التحديث يتفعّل فعليًا
const MAX_PULL = 110; // أقصى مسافة مسموح نوريها بصريًا حتى لو المستخدم سحب أكتر
const RESISTANCE = 0.45; // "مطاطية" السحب — كل ما اتسحب أكتر كل ما استجابته تقل

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
}

// سحب من فوق الصفحة الرئيسية لتحديث قائمة المهام — نمط قياسي جدًا في
// تطبيقات الموبايل (المرحلة 4 من خطة التطبيق الاحترافي). بيتفعّل بس لو
// المستخدم بادئ السحب وهو فعليًا في أعلى الصفحة (scrollY === 0)، عشان
// ميتعارضش مع سكرول القائمة العادي.
export default function PullToRefresh({ onRefresh, children, disabled = false }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled || refreshing) return;
    // بس لما الصفحة فعلاً في القمة — لو المستخدم بيسكرول جوه قائمة طويلة
    // مش عايزين نتدخل في السحب العادي بتاعه.
    if (window.scrollY > 0) {
      startYRef.current = null;
      return;
    }
    startYRef.current = e.touches[0].clientY;
    triggeredRef.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startYRef.current === null || disabled || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // لو الصفحة اتحركت لأي سبب (مثلاً المستخدم فعليًا بيسكرول) نلغي المتابعة
    if (window.scrollY > 0) {
      startYRef.current = null;
      setPull(0);
      return;
    }
    const damped = Math.min(MAX_PULL, delta * RESISTANCE);
    setPull(damped);
    if (damped >= TRIGGER_DISTANCE && !triggeredRef.current) {
      triggeredRef.current = true;
      void hapticImpact('medium');
    }
  }

  async function onTouchEnd() {
    if (startYRef.current === null) return;
    const shouldRefresh = pull >= TRIGGER_DISTANCE;
    startYRef.current = null;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(TRIGGER_DISTANCE);
    try {
      await onRefresh();
      void hapticNotification('success');
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  const indicatorProgress = Math.min(1, pull / TRIGGER_DISTANCE);
  const reduceMotion = prefersReducedMotion();

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="pull-refresh-indicator"
        style={{
          height: pull,
          opacity: pull > 4 ? 1 : 0,
          transition: pull === 0 || refreshing ? 'height 180ms var(--ease-out), opacity 180ms' : 'none',
        }}
        aria-hidden={pull === 0}
      >
        <span
          className={`pull-refresh-spinner ${refreshing ? 'spinning' : ''}`}
          style={{
            transform: reduceMotion || refreshing ? undefined : `rotate(${indicatorProgress * 220}deg)`,
            opacity: refreshing ? 1 : 0.55 + indicatorProgress * 0.45,
          }}
        >
          <DynamicIcon name={refreshing ? 'loader' : 'arrow-down'} size={18} />
        </span>
      </div>
      {children}
    </div>
  );
}

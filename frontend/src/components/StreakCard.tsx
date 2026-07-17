import { useEffect, useState } from 'react';
import { getStreak } from '../lib/api';
import { DynamicIcon } from '../lib/icons';

// بطاقة "سلسلة الإنجاز اليومي" — بتعرض عدد الأيام المتتالية اللي المستخدم
// أكّد فيها إنهاء مهمة رئيسية واحدة على الأقل. الحساب بالكامل من السيرفر
// (شوف routes/streak.ts)، هنا بس عرض + رسالة تحفيزية حسب طول السلسلة.
export default function StreakCard() {
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStreak()
      .then((data) => {
        if (!cancelled) setCurrent(data.current);
      })
      .catch(() => {
        if (!cancelled) setCurrent(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (current === null) return null;

  const hasStreak = current > 0;
  const message = !hasStreak
    ? 'خلّص مهمة النهاردة وابدأ سلسلتك'
    : current === 1
      ? 'يوم واحد لحد دلوقتي — كمّل بكرة!'
      : `${current} أيام متتالية — استمر!`;

  return (
    <div className={`stat-block streak-block ${!hasStreak ? 'disabled' : ''}`}>
      <div className="stat-block-head">
        <span
          className="stat-block-icon streak-block-icon"
          style={{
            color: hasStreak ? 'var(--streak)' : 'var(--text-muted)',
            background: hasStreak ? 'var(--streak-dim)' : 'var(--surface-2)',
          }}
        >
          <DynamicIcon name="flame" size={16} />
        </span>
        <div className="stat-block-main">
          <span className={`stat-block-value ${hasStreak ? 'streak-block-value' : ''}`} dir="ltr">
            {current}
          </span>
          <span className="stat-block-label">{message}</span>
        </div>
      </div>
    </div>
  );
}

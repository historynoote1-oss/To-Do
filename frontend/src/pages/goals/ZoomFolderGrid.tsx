// ===== شبكة "مجلدات" خريطة العرض الكاملة (Zoom Navigation) =====
// مكوّن عرض بحت (مفيهوش أي state داخلي) — كل حاجة بتوصله عن طريق props من
// GoalMap. اتقسّم في ملفه الخاص لأنه ما بيحتاجش يوصل لأي state جوّه
// GoalMap نفسها.

import { DynamicIcon } from '@/utils/icons';
import { GoalList, ZoomFolderItem, ZoomGridDensity } from './goalMapTypes';

export default function ZoomFolderGrid({
  items,
  emptyLabel,
  density = 'folders',
  onEditGoal,
  onGoalLongPressStart,
  onGoalLongPressEnd,
  longPressFiredRef,
  pressingGoalId,
}: {
  items: ZoomFolderItem[];
  emptyLabel: string;
  density?: ZoomGridDensity;
  // ===== حذف بالتبعيات + تعديل — شوف `goal` في ZoomFolderItem =====
  // بيتفعّلوا بس على الكروت اللي معاها `goal` (أهداف حقيقية)، والكروت
  // التجميعية (مجال حياة/سنة) والخانات التقويمية بتتجاهلهم تمامًا.
  onEditGoal?: (goal: GoalList) => void;
  onGoalLongPressStart?: (goal: GoalList) => void;
  onGoalLongPressEnd?: () => void;
  longPressFiredRef?: { current: boolean };
  pressingGoalId?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="zoom-map-empty">
        <DynamicIcon name="folder-open" size={26} className="empty-icon" />
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className={`zoom-map-grid ${density !== 'folders' ? `zoom-map-grid-${density}` : ''}`}>
      {items.map((it) => {
        const percent = it.totalCount === 0 ? 0 : Math.round((it.doneCount / it.totalCount) * 100);
        // دائرة إنجاز (المرحلة 7): لما كل أبناء المجلد ده يخلصوا، بنستبدل
        // شريط التقدّم بحلقة/شارة "خلص" واضحة بدل النسبة — نفس فكرة الصح
        // الأخضر على مستوى الكارت المنفرد بس على مستوى المجلد كله.
        const isFullyComplete = it.totalCount > 0 && it.doneCount === it.totalCount;
        if (it.calendar) {
          // ===== كارت خانة تقويمية (شهر/أسبوع/يوم) — شكل مصغّر ومحايد
          // اللون عمدًا (مفيش --zoom-color هنا)، رقم كبير بدل أيقونة، ونقطة
          // إنجاز صغيرة بدل شريط تقدّم كامل — عشان يفضل واضح إنه "خانة
          // تقويمية ثابتة" مش هدف حقيقي كتبه المستخدم. =====
          return (
            <button
              key={it.key}
              type="button"
              className={`zoom-cal-chip ${it.totalCount > 0 ? 'has-goals' : ''} ${isFullyComplete ? 'zoom-cal-chip-complete' : ''}`}
              onClick={it.onOpen}
              title={it.title}
            >
              {it.badge ? (
                <span className="zoom-cal-chip-num" dir="ltr">{it.badge}</span>
              ) : (
                <DynamicIcon name={it.icon} size={15} className="zoom-cal-chip-icon" />
              )}
              <span className="zoom-cal-chip-label">{it.title}</span>
              {it.totalCount > 0 && (
                <span className="zoom-cal-chip-dot" title={`${it.doneCount}/${it.totalCount}`}>
                  {isFullyComplete ? <DynamicIcon name="check" size={10} /> : <span>{it.totalCount}</span>}
                </span>
              )}
            </button>
          );
        }
        // كارت هدف حقيقي (سنوي/شهري/أسبوعي/يومي) بيحمل `goal` — بنغلّفه في
        // `div` عشان نقدر نحط زرار "تعديل" كعنصر شقيق منفصل فوقه (مش جوّاه،
        // لأن زرار جوه زرار مش سليم في الـ HTML)، ونربط الضغطة المطوّلة
        // بالكارت الرئيسي بنفس أسلوب حذف السنة بالظبط.
        const isPressing = !!it.goal && pressingGoalId === it.goal.id;
        return (
          <div key={it.key} className="zoom-folder-card-wrap">
            <button
              type="button"
              className={`zoom-folder-card ${isFullyComplete ? 'zoom-folder-card-complete' : ''} ${isPressing ? 'zoom-folder-card-pressing' : ''}`}
              style={it.color ? ({ ['--zoom-color' as any]: it.color, ['--zoom-bg' as any]: it.bg } as any) : undefined}
              onClick={() => {
                if (it.goal && longPressFiredRef?.current) {
                  longPressFiredRef.current = false;
                  return;
                }
                it.onOpen();
              }}
              onPointerDown={it.goal ? () => onGoalLongPressStart?.(it.goal!) : undefined}
              onPointerUp={it.goal ? onGoalLongPressEnd : undefined}
              onPointerLeave={it.goal ? onGoalLongPressEnd : undefined}
              onPointerCancel={it.goal ? onGoalLongPressEnd : undefined}
              onContextMenu={it.goal ? (e) => e.preventDefault() : undefined}
              title={it.goal ? `${it.title} — اضغط مطوّلًا للحذف` : it.title}
            >
              <span className="zoom-folder-card-icon">
                <DynamicIcon name={it.icon} size={20} />
              </span>
              <span className="zoom-folder-card-title" title={it.title}>
                {it.title}
              </span>
              {it.totalCount > 0 &&
                (isFullyComplete ? (
                  <span className="zoom-folder-card-complete-ring" title={`اكتمل ${it.doneCount}/${it.totalCount}`}>
                    <DynamicIcon name="check" size={13} />
                    <span>مكتمل</span>
                  </span>
                ) : (
                  <span className="zoom-folder-card-progress">
                    <span className="zoom-folder-card-progress-track">
                      <span className="zoom-folder-card-progress-fill" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="zoom-folder-card-progress-label">
                      {it.doneCount}/{it.totalCount} · {percent}٪
                    </span>
                  </span>
                ))}
              <DynamicIcon name="chevron-left" size={16} className="zoom-folder-card-chevron" />
            </button>
            {it.goal && onEditGoal && (
              <button
                type="button"
                className="zoom-folder-card-edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGoal(it.goal!);
                }}
                aria-label="تعديل الهدف"
                title="تعديل"
              >
                <DynamicIcon name="pencil" size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useMemo } from 'react';
import { isListDone, isOverdue, MinimalList } from '../lib/organize';
import { DynamicIcon } from '../lib/icons';
import { sounds } from '../lib/sounds';

interface Props {
  lists: MinimalList[];
  onJumpToOverdue: () => void;
}

// بطاقة "المهام المتأخرة عن موعدها" — بتحسب المهام الرئيسية النشطة (غير
// مكتملة بالكامل) اللي فيها مهمة فرعية استحقاقها فات ولسه مش منجزة
// (بنستخدم نفس isOverdue المُستخدمة في ترتيب المهام، عشان المنطق يفضل
// موحّد في كل مكان). النسبة % من إجمالي المهام النشطة، مش كل المهام.
export default function OverdueTasksCard({ lists, onJumpToOverdue }: Props) {
  const { overdueCount, activeTotal, pct } = useMemo(() => {
    const active = lists.filter((l) => !isListDone(l));
    const overdue = active.filter((l) => isOverdue(l));
    return {
      overdueCount: overdue.length,
      activeTotal: active.length,
      pct: active.length > 0 ? Math.round((overdue.length / active.length) * 100) : 0,
    };
  }, [lists]);

  const hasOverdue = overdueCount > 0;

  function handleJump() {
    if (!hasOverdue) return;
    sounds.click();
    onJumpToOverdue();
  }

  return (
    <div className={`stat-block ${!hasOverdue ? 'disabled' : ''}`}>
      <div className="stat-block-head">
        <span
          className="stat-block-icon"
          style={{
            color: hasOverdue ? 'var(--danger)' : 'var(--text-muted)',
            background: hasOverdue ? 'rgba(193,51,39,0.12)' : 'var(--surface-2)',
          }}
        >
          <DynamicIcon name="timer" size={16} />
        </span>
        <div className="stat-block-main">
          <span className={`stat-block-value ${hasOverdue ? 'stat-block-value-urgent' : ''}`}>{overdueCount}</span>
          <span className="stat-block-label">
            مهام متأخرة عن موعدها {activeTotal > 0 && <span dir="ltr">({pct}%)</span>}
          </span>
        </div>
      </div>

      {hasOverdue && (
        <button type="button" className="stat-block-toggle" onClick={handleJump}>
          <DynamicIcon name="chevron-left" size={14} className="stat-block-toggle-icon" />
          <span>روح لأول مهمة متأخرة</span>
        </button>
      )}
    </div>
  );
}

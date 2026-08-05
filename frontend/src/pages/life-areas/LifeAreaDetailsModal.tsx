import { LifeAreaNode, hexToSoftBg } from '@/utils/lifeArea';
import { AreaAvatar } from '@/pages/life-areas/LifeAreaShared';
import { resolveLifeAreaImageUrl } from '@/services/api';
import { DynamicIcon } from '@/utils/icons';
import Portal from '@/components/common/Portal';

// لوحة تفاصيل مجال حياة (رئيسي أو فرعي) — بتتفتح بالضغط على اسم المجال
// من الكارت. بديل مباشر للصف القديم المزدحم (life-area-details-panel)
// اللي كان بيتحط جوه الكارت نفسه؛ دلوقتي التفاصيل ليها مساحتها الخاصة
// بتصميم واضح: هيدر ملوّن بلون المجال، شبكة إحصائيات، وشريط تقدّم كبير.
export default function LifeAreaDetailsModal({
  area,
  parentName,
  onClose,
}: {
  area: LifeAreaNode | null;
  parentName?: string | null;
  onClose: () => void;
}) {
  if (!area) return null;
  const hasChildren = area.childCount > 0;

  return (
    <Portal>
      <div className="modal-overlay life-area-details-overlay" onClick={onClose}>
        <div
          className="modal-box life-area-details-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="life-area-details-title"
        >
          <div className="life-area-details-hero" style={{ background: hexToSoftBg(area.color, 0.16) }}>
            <button className="icon-btn small life-area-details-close" onClick={onClose} type="button" aria-label="إغلاق">
              <DynamicIcon name="x" size={15} />
            </button>
            <AreaAvatar
              color={area.color}
              icon={area.icon}
              imageUrl={resolveLifeAreaImageUrl(area.imageUrl)}
              size={64}
              iconSize={28}
            />
            <h2 id="life-area-details-title">{area.name}</h2>
            <span className="life-area-details-kicker">
              {parentName ? (
                <>
                  <DynamicIcon name="reply" size={11} /> مجال فرعي تحت "{parentName}"
                </>
              ) : (
                'مجال حياة رئيسي'
              )}
            </span>
          </div>

          <div className="life-area-details-body">
            <div className="life-area-details-progress">
              <div className="life-area-details-progress-track">
                <div
                  className="life-area-details-progress-fill"
                  style={{ width: `${area.stats.completionRate}%`, background: area.color }}
                />
              </div>
              <span className="life-area-details-progress-label">{area.stats.completionRate}٪ مكتمل</span>
            </div>

            <div className="life-area-details-stat-grid">
              <div className="life-area-details-stat">
                <DynamicIcon name="list-checks" size={16} />
                <strong>{area.stats.totalLists}</strong>
                <span>قائمة مهام</span>
              </div>
              <div className="life-area-details-stat">
                <DynamicIcon name="check-circle" size={16} />
                <strong>{area.stats.completedLists}</strong>
                <span>قائمة مكتملة</span>
              </div>
              <div className="life-area-details-stat">
                <DynamicIcon name="clipboard-list" size={16} />
                <strong>{area.stats.totalItems}</strong>
                <span>مهمة فرعية</span>
              </div>
              <div className="life-area-details-stat">
                <DynamicIcon name="sparkles" size={16} />
                <strong>{area.stats.doneItems}</strong>
                <span>مهمة منجزة</span>
              </div>
            </div>

            {hasChildren && (
              <div className="life-area-details-aggregate">
                <div className="life-area-details-aggregate-title">
                  <DynamicIcon name="folder-open" size={13} />
                  إجمالاً مع {area.childCount} مجال فرعي
                </div>
                <div className="life-area-details-aggregate-row">
                  <span>{area.aggregatedStats.totalLists} قائمة مهام</span>
                  <span>
                    {area.aggregatedStats.doneItems}/{area.aggregatedStats.totalItems} مهمة
                  </span>
                  <span className="life-area-details-aggregate-rate">{area.aggregatedStats.completionRate}٪</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

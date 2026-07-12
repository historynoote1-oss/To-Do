import { CATEGORY_MAP } from '../lib/category';
import { PRIORITY_MAP } from '../lib/priority';
import { LifeAreaLite } from './LifeArea';
import { hexToSoftBg } from '../lib/lifeArea';
import { DATE_PRESET_LABELS, FilterCriteria, NO_LIFE_AREA, SavedFilter, countActiveDimensions } from '../lib/filters';

interface Props {
  criteria: FilterCriteria;
  lifeAreas: LifeAreaLite[];
  savedFilters: SavedFilter[];
  resultCount: number;
  onOpenPanel: () => void;
  onChange: (next: FilterCriteria) => void;
  onApplySaved: (f: SavedFilter) => void;
  onResetAll: () => void;
}

export default function FilterBar({
  criteria,
  lifeAreas,
  savedFilters,
  resultCount,
  onOpenPanel,
  onChange,
  onApplySaved,
  onResetAll,
}: Props) {
  const activeCount = countActiveDimensions(criteria);
  const lifeAreaById = new Map(lifeAreas.map((a) => [a.id, a]));

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <button className={`filter-trigger ${activeCount > 0 ? 'active' : ''}`} onClick={onOpenPanel} type="button">
          <span aria-hidden="true">🔍</span> فلاتر
          {activeCount > 0 && <span className="filter-count-pill">{activeCount}</span>}
        </button>

        {savedFilters.length > 0 && (
          <div className="saved-filter-quick-row">
            {savedFilters.map((sf) => (
              <button key={sf.id} type="button" className="saved-filter-quick-chip" onClick={() => onApplySaved(sf)}>
                ⭐ {sf.name}
              </button>
            ))}
          </div>
        )}

        <div className="section-heading filter-bar-heading">قوائمك ({resultCount})</div>
      </div>

      {activeCount > 0 && (
        <div className="active-filter-row">
          {criteria.status === 'active' && (
            <span className="active-filter-chip">
              نشطة فقط
              <button type="button" onClick={() => onChange({ ...criteria, status: 'all' })} aria-label="إزالة فلتر الحالة">
                ✕
              </button>
            </span>
          )}
          {criteria.categories.map((key) => {
            const c = CATEGORY_MAP[key];
            return (
              <span key={key} className="active-filter-chip" style={{ color: c.color, background: c.bg }}>
                {c.icon} {c.label}
                <button
                  type="button"
                  onClick={() => onChange({ ...criteria, categories: criteria.categories.filter((k) => k !== key) })}
                  aria-label={`إزالة فلتر ${c.label}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
          {criteria.lifeAreaIds.map((id) => {
            if (id === NO_LIFE_AREA) {
              return (
                <span key={id} className="active-filter-chip">
                  🚫 بدون مجال
                  <button
                    type="button"
                    onClick={() => onChange({ ...criteria, lifeAreaIds: criteria.lifeAreaIds.filter((v) => v !== id) })}
                    aria-label="إزالة فلتر بدون مجال"
                  >
                    ✕
                  </button>
                </span>
              );
            }
            const a = lifeAreaById.get(id);
            if (!a) return null;
            return (
              <span key={id} className="active-filter-chip" style={{ color: a.color, background: hexToSoftBg(a.color) }}>
                {a.icon || '🏷️'} {a.name}
                <button
                  type="button"
                  onClick={() => onChange({ ...criteria, lifeAreaIds: criteria.lifeAreaIds.filter((v) => v !== id) })}
                  aria-label={`إزالة فلتر ${a.name}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
          {criteria.priorities.map((key) => {
            const p = PRIORITY_MAP[key];
            return (
              <span key={key} className="active-filter-chip" style={{ color: p.color, background: p.bg }}>
                {p.label}
                <button
                  type="button"
                  onClick={() => onChange({ ...criteria, priorities: criteria.priorities.filter((k) => k !== key) })}
                  aria-label={`إزالة فلتر ${p.label}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
          {criteria.datePreset !== 'ANY' && (
            <span className="active-filter-chip">
              {DATE_PRESET_LABELS[criteria.datePreset]}
              <button
                type="button"
                onClick={() => onChange({ ...criteria, datePreset: 'ANY' })}
                aria-label="إزالة فلتر التاريخ"
              >
                ✕
              </button>
            </span>
          )}
          <button className="clear-all-filters" type="button" onClick={onResetAll}>
            مسح الكل
          </button>
        </div>
      )}
    </div>
  );
}

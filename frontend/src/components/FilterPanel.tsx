import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../lib/category';
import { PRIORITIES } from '../lib/priority';
import { LifeAreaLite } from './LifeArea';
import { hexToSoftBg } from '../lib/lifeArea';
import { PriorityIcon } from './Priority';
import {
  DATE_PRESET_LABELS,
  DatePreset,
  FilterCriteria,
  NO_LIFE_AREA,
  SavedFilter,
  countActiveDimensions,
  isDefaultFilters,
} from '../lib/filters';
import { sounds } from '../lib/sounds';

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface Props {
  open: boolean;
  criteria: FilterCriteria;
  lifeAreas: LifeAreaLite[];
  savedFilters: SavedFilter[];
  resultCount: number;
  onChange: (next: FilterCriteria) => void;
  onReset: () => void;
  onClose: () => void;
  onSave: (name: string) => void;
  onApplySaved: (f: SavedFilter) => void;
  onDeleteSaved: (id: string) => void;
}

export default function FilterPanel({
  open,
  criteria,
  lifeAreas,
  savedFilters,
  resultCount,
  onChange,
  onReset,
  onClose,
  onSave,
  onApplySaved,
  onDeleteSaved,
}: Props) {
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSaveInput) nameInputRef.current?.focus();
  }, [showSaveInput]);

  useEffect(() => {
    if (!open) {
      setShowSaveInput(false);
      setSaveName('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const activeCount = countActiveDimensions(criteria);

  function submitSave() {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setSaveName('');
    setShowSaveInput(false);
    sounds.success();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box filter-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="فلاتر متقدمة"
      >
        <div className="filter-modal-header">
          <h2>الفلاتر {activeCount > 0 ? <span className="filter-count-pill">{activeCount}</span> : null}</h2>
          <button className="icon-btn small" onClick={onClose} type="button" aria-label="إغلاق">
            ✕
          </button>
        </div>

        {savedFilters.length > 0 && (
          <div className="filter-section">
            <div className="filter-section-label">الفلاتر المحفوظة</div>
            <div className="saved-filter-row">
              {savedFilters.map((sf) => (
                <span key={sf.id} className="saved-filter-chip">
                  <button type="button" onClick={() => onApplySaved(sf)}>
                    ⭐ {sf.name}
                  </button>
                  <button
                    type="button"
                    className="saved-filter-remove"
                    onClick={() => onDeleteSaved(sf.id)}
                    aria-label={`حذف فلتر ${sf.name}`}
                    title="حذف الفلتر"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="filter-section">
          <div className="filter-section-label">الحالة</div>
          <div className="filter-tabs">
            <button
              type="button"
              className={criteria.status === 'all' ? 'active' : ''}
              onClick={() => onChange({ ...criteria, status: 'all' })}
            >
              الكل
            </button>
            <button
              type="button"
              className={criteria.status === 'active' ? 'active' : ''}
              onClick={() => onChange({ ...criteria, status: 'active' })}
            >
              نشطة فقط
            </button>
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-section-label">التصنيف</div>
          <div className="filter-chip-row">
            {CATEGORIES.map((c) => {
              const selected = criteria.categories.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`filter-chip ${selected ? 'selected' : ''}`}
                  style={selected ? { color: c.color, background: c.bg, borderColor: c.color } : undefined}
                  onClick={() => {
                    sounds.hover();
                    onChange({ ...criteria, categories: toggleValue(criteria.categories, c.key) });
                  }}
                  aria-pressed={selected}
                >
                  {c.icon} {c.label}
                </button>
              );
            })}
          </div>
          {criteria.categories.includes('YEARLY') && (
            <div className="category-year-stepper category-year-stepper-inline">
              <span className="category-year-label">السنة</span>
              <div className="category-year-controls">
                <button
                  type="button"
                  onClick={() => onChange({ ...criteria, targetYear: criteria.targetYear - 1 })}
                  aria-label="سنة أقل"
                >
                  −
                </button>
                <span className="category-year-value" dir="ltr">
                  {criteria.targetYear}
                </span>
                <button
                  type="button"
                  onClick={() => onChange({ ...criteria, targetYear: criteria.targetYear + 1 })}
                  aria-label="سنة أكتر"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {lifeAreas.length > 0 && (
          <div className="filter-section">
            <div className="filter-section-label">مجال الحياة</div>
            <div className="filter-chip-row">
              {lifeAreas.map((a) => {
                const selected = criteria.lifeAreaIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`filter-chip ${selected ? 'selected' : ''}`}
                    style={selected ? { color: a.color, background: hexToSoftBg(a.color), borderColor: a.color } : undefined}
                    onClick={() => {
                      sounds.hover();
                      onChange({ ...criteria, lifeAreaIds: toggleValue(criteria.lifeAreaIds, a.id) });
                    }}
                    aria-pressed={selected}
                  >
                    {a.icon || '🏷️'} {a.name}
                  </button>
                );
              })}
              <button
                type="button"
                className={`filter-chip ${criteria.lifeAreaIds.includes(NO_LIFE_AREA) ? 'selected' : ''}`}
                onClick={() => {
                  sounds.hover();
                  onChange({ ...criteria, lifeAreaIds: toggleValue(criteria.lifeAreaIds, NO_LIFE_AREA) });
                }}
                aria-pressed={criteria.lifeAreaIds.includes(NO_LIFE_AREA)}
              >
                🚫 بدون مجال
              </button>
            </div>
          </div>
        )}

        <div className="filter-section">
          <div className="filter-section-label">الأولوية</div>
          <div className="filter-chip-row">
            {PRIORITIES.map((p) => {
              const selected = criteria.priorities.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`filter-chip ${selected ? 'selected' : ''}`}
                  style={selected ? { color: p.color, background: p.bg, borderColor: p.color } : undefined}
                  onClick={() => {
                    sounds.hover();
                    onChange({ ...criteria, priorities: toggleValue(criteria.priorities, p.key) });
                  }}
                  aria-pressed={selected}
                >
                  <PriorityIcon level={p.level} color={selected ? p.color : 'currentColor'} size={12} />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-section-label">التاريخ</div>
          <div className="filter-chip-row">
            {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-chip ${criteria.datePreset === key ? 'selected' : ''}`}
                onClick={() => {
                  sounds.hover();
                  onChange({ ...criteria, datePreset: key });
                }}
                aria-pressed={criteria.datePreset === key}
              >
                {DATE_PRESET_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-modal-footer">
          <div className="filter-result-count">{resultCount} قائمة مطابقة</div>
          <div className="filter-modal-footer-actions">
            <button className="small" type="button" onClick={onReset} disabled={isDefaultFilters(criteria)}>
              مسح الكل
            </button>
            {!showSaveInput ? (
              <button
                className="small"
                type="button"
                onClick={() => setShowSaveInput(true)}
                disabled={isDefaultFilters(criteria)}
              >
                💾 حفظ الفلتر
              </button>
            ) : null}
            <button className="small" type="button" onClick={onClose}>
              تم
            </button>
          </div>
        </div>

        {showSaveInput && (
          <div className="filter-save-row">
            <input
              ref={nameInputRef}
              type="text"
              placeholder="اسم الفلتر (مثلاً: مهام العمل العاجلة)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSave();
                if (e.key === 'Escape') setShowSaveInput(false);
              }}
              maxLength={40}
            />
            <button className="small" type="button" onClick={submitSave} disabled={!saveName.trim()}>
              حفظ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

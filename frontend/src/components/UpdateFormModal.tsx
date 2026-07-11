import { useState } from 'react';
import { AdminUpdateEntry, UpdateFormData } from '../lib/api';

const COMMON_EMOJIS = ['✨', '🚀', '🛡️', '🐛', '⚡', '🎨', '📢', '🏴', '🔧', '💡'];

function toDatetimeLocal(iso?: string) {
  if (!iso) return new Date().toISOString().slice(0, 16);
  return new Date(iso).toISOString().slice(0, 16);
}

export default function UpdateFormModal({
  existing,
  onClose,
  onSubmit,
}: {
  existing: AdminUpdateEntry | null;
  onClose: () => void;
  onSubmit: (data: UpdateFormData) => Promise<void>;
}) {
  const [emoji, setEmoji] = useState(existing?.emoji || '✨');
  const [version, setVersion] = useState(existing?.version || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [featuresText, setFeaturesText] = useState((existing?.features || []).join('\n'));
  const [howToTitle, setHowToTitle] = useState(existing?.howToTitle || 'كيفية الاستخدام');
  const [howToStepsText, setHowToStepsText] = useState((existing?.howToSteps || []).join('\n'));
  const [authorName, setAuthorName] = useState(existing?.authorName || 'فريق الموقع');
  const [pinned, setPinned] = useState(existing?.pinned || false);
  const [isPublished, setIsPublished] = useState(existing?.isPublished ?? true);
  const [publishedAt, setPublishedAt] = useState(toDatetimeLocal(existing?.publishedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError('عنوان التحديث مطلوب');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        emoji: emoji.trim() || '✨',
        version: version.trim() || null,
        title: title.trim(),
        features: featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        howToTitle: howToTitle.trim() || null,
        howToSteps: howToStepsText.split('\n').map((s) => s.trim()).filter(Boolean),
        authorName: authorName.trim() || 'فريق الموقع',
        pinned,
        isPublished,
        publishedAt: new Date(publishedAt).toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box update-form-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? 'تعديل تحديث' : 'تحديث جديد'}</h2>

        <div className="update-form-row emoji-row">
          <label>الأيقونة</label>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="emoji-input" />
          <div className="emoji-picker">
            {COMMON_EMOJIS.map((e) => (
              <button key={e} type="button" className="emoji-option" onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="update-form-row">
          <label>العنوان *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان التحديث" />
        </div>

        <div className="update-form-row">
          <label>رقم الإصدار (اختياري)</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="مثلاً: 0.4" />
        </div>

        <div className="update-form-row">
          <label>نقاط التحديث (سطر لكل نقطة)</label>
          <textarea
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            rows={5}
            placeholder={'نقطة أولى\nنقطة تانية\nنقطة تالتة'}
          />
        </div>

        <div className="update-form-row">
          <label>عنوان قسم "كيفية الاستخدام" (اختياري)</label>
          <input value={howToTitle} onChange={(e) => setHowToTitle(e.target.value)} />
        </div>

        <div className="update-form-row">
          <label>خطوات الاستخدام (سطر لكل خطوة)</label>
          <textarea
            value={howToStepsText}
            onChange={(e) => setHowToStepsText(e.target.value)}
            rows={3}
            placeholder={'اضغط على...\nبعدين...'}
          />
        </div>

        <div className="update-form-row">
          <label>اسم الكاتب (بشري)</label>
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
        </div>

        <div className="update-form-row">
          <label>تاريخ النشر</label>
          <input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
        </div>

        <div className="update-form-toggles">
          <label className="toggle-check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            📌 تثبيت فوق الكل
          </label>
          <label className="toggle-check">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            👁️ منشور (وإلا مسودة مخفية)
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="small" onClick={onClose} type="button" disabled={saving}>
            إلغاء
          </button>
          <button onClick={handleSave} type="button" disabled={saving}>
            {saving ? 'جاري الحفظ...' : existing ? 'حفظ التعديلات' : 'إنشاء التحديث'}
          </button>
        </div>
      </div>
    </div>
  );
}

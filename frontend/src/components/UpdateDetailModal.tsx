import { UpdateEntry } from '../lib/api';
import HumanBadge from './HumanBadge';

export default function UpdateDetailModal({
  update,
  onClose,
}: {
  update: UpdateEntry;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box update-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="update-detail-header">
          <span className="update-badge-emoji">{update.emoji}</span>
          <div>
            <div className="update-meta">
              {update.version && <span className="update-version">الإصدار {update.version}</span>}
              <span className="update-date">
                {new Date(update.publishedAt).toLocaleDateString('ar-EG', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <h2 className="update-title">{update.title}</h2>
          </div>
        </div>

        <HumanBadge authorName={update.authorName} />

        <ul className="update-features">
          {update.features.map((f, i) => (
            <li key={i}>
              <span className="update-check">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {update.howToSteps.length > 0 && (
          <div className="update-howto">
            <p className="update-howto-toggle" style={{ cursor: 'default' }}>
              💡 {update.howToTitle || 'كيفية الاستخدام'}
            </p>
            <ol className="update-howto-steps">
              {update.howToSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="modal-actions">
          <button className="small" onClick={onClose} type="button">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

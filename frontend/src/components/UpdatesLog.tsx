import { useState } from 'react';
import { updates } from '../data/updates';

export default function UpdatesLog({ onBack }: { onBack: () => void }) {
  const [openHowTo, setOpenHowTo] = useState<number | null>(updates[0]?.id ?? null);

  return (
    <div className="updates-page">
      <div className="updates-header">
        <button className="small updates-back" onClick={onBack}>
          → رجوع
        </button>
        <h1>📢 التحديثات</h1>
        <p className="updates-subtitle">آخر أخبار وتحسينات الموقع أول بأول</p>
      </div>

      <div className="updates-timeline">
        {updates.map((update, index) => (
          <div className="update-card" key={update.id}>
            <div className="update-badge">
              <span className="update-badge-emoji">{update.emoji}</span>
              <span className="update-badge-num">#{update.id}</span>
              {index !== updates.length - 1 && <span className="update-badge-line" />}
            </div>

            <div className="update-content">
              <div className="update-meta">
                <span className="update-version">الإصدار {update.version}</span>
                <span className="update-date">{update.date}</span>
              </div>
              <h2 className="update-title">{update.title}</h2>

              <div className="update-divider" />

              <ul className="update-features">
                {update.features.map((feature, i) => (
                  <li key={i}>
                    <span className="update-check">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {update.howTo && (
                <div className="update-howto">
                  <button
                    className="update-howto-toggle"
                    onClick={() =>
                      setOpenHowTo(openHowTo === update.id ? null : update.id)
                    }
                    type="button"
                  >
                    <span>💡 {update.howTo.title}</span>
                    <span className={`update-howto-arrow ${openHowTo === update.id ? 'open' : ''}`}>
                      ⌄
                    </span>
                  </button>
                  {openHowTo === update.id && (
                    <ol className="update-howto-steps">
                      {update.howTo.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="updates-footer">
        <p>❤️ شكرًا لدعمكم</p>
        <p>📚 بالتوفيق للجميع</p>
      </div>
    </div>
  );
}

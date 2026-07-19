import { useEffect, useState } from 'react';
import {
  getTwoFactorStatus,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
} from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import { DynamicIcon } from '../lib/icons';

type Stage = 'loading' | 'idle' | 'setup' | 'recovery-codes' | 'disable';

export default function TwoFactorSettings() {
  const [stage, setStage] = useState<Stage>('loading');
  const [enabled, setEnabled] = useState(false);
  const [enabledAt, setEnabledAt] = useState<string | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const status = await getTwoFactorStatus();
      setEnabled(status.twoFactorEnabled);
      setEnabledAt(status.twoFactorEnabledAt);
      setStage('idle');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل حالة التحقق بخطوتين');
      setStage('idle');
    }
  }

  async function handleStartSetup() {
    setSetupError(null);
    try {
      const data = await setupTwoFactor();
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret);
      setSetupCode('');
      setStage('setup');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر بدء الإعداد');
    }
  }

  async function handleConfirmSetup() {
    if (!setupCode) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const data = await enableTwoFactor(setupCode.trim());
      sounds.success();
      setRecoveryCodes(data.recoveryCodes);
      setEnabled(true);
      setEnabledAt(new Date().toISOString());
      setStage('recovery-codes');
    } catch (err) {
      sounds.error();
      setSetupError(err instanceof Error ? err.message : 'الكود غلط');
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleDisable() {
    if (!disablePassword || !disableCode) return;
    setDisableLoading(true);
    setDisableError(null);
    try {
      await disableTwoFactor(disablePassword, disableCode.trim());
      sounds.click();
      setEnabled(false);
      setEnabledAt(null);
      setStage('idle');
      setDisablePassword('');
      setDisableCode('');
    } catch (err) {
      sounds.error();
      setDisableError(err instanceof Error ? err.message : 'فشلت العملية');
    } finally {
      setDisableLoading(false);
    }
  }

  function finishRecoveryCodes() {
    setRecoveryCodes([]);
    setStage('idle');
  }

  if (stage === 'loading') {
    return <div className="skeleton" style={{ height: 160, marginTop: 20 }} />;
  }

  return (
    <div className="security-panel">
      <h2><DynamicIcon name="shield-check" size={18} /> التحقق بخطوتين (2FA)</h2>
      <p className="modal-text">
        طبقة حماية إضافية لحساب الأدمن: حتى لو حد عرف كلمة مرورك، مش هيقدر يدخل من غير كود من تطبيق
        مصادقة زي Google Authenticator أو Authy على موبايلك.
      </p>

      {stage === 'idle' && (
        <div className="security-status-card">
          <span className={`twofa-badge ${enabled ? 'twofa-on' : 'twofa-off'}`}>
            {enabled ? (
              <><DynamicIcon name="check-circle" size={14} /> مفعّل</>
            ) : (
              <><DynamicIcon name="alert" size={14} /> غير مفعّل</>
            )}
          </span>
          {enabled && enabledAt && (
            <span className="user-row-meta">
              اتفعّل بتاريخ {new Date(enabledAt).toLocaleString('ar-EG')}
            </span>
          )}
          <div className="security-status-actions">
            {!enabled && (
              <button className="small" onClick={handleStartSetup}>
                تفعيل التحقق بخطوتين
              </button>
            )}
            {enabled && (
              <button className="danger small" onClick={() => setStage('disable')}>
                إلغاء التحقق بخطوتين
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'setup' && (
        <div className="security-status-card">
          <p className="modal-text modal-hint">١. افتح تطبيق المصادقة وامسح الكود ده:</p>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="twofa-qr" />}
          <p className="modal-text modal-hint">
            أو اكتب السر ده يدويًا لو التطبيق مش قادر يمسح الصورة:
          </p>
          <code className="twofa-secret">{secret}</code>
          <p className="modal-text modal-hint">٢. اكتب الكود المكوّن من 6 أرقام اللي ظهر في التطبيق:</p>
          <input
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmSetup()}
          />
          {setupError && <p className="error">{setupError}</p>}
          <div className="modal-actions">
            <button className="small" onClick={() => setStage('idle')} type="button">
              إلغاء
            </button>
            <button
              className="small"
              onClick={handleConfirmSetup}
              disabled={!setupCode || setupLoading}
              type="button"
            >
              {setupLoading ? 'جاري التأكيد...' : 'تأكيد وتفعيل'}
            </button>
          </div>
        </div>
      )}

      {stage === 'recovery-codes' && (
        <div className="security-status-card">
          <p className="modal-text">
            <DynamicIcon name="check-circle" size={14} /> تم تفعيل التحقق بخطوتين. احفظ أكواد الاسترجاع دي في مكان آمن — كل كود بيتستخدم مرة
            واحدة بس، وهتحتاجهم لو فقدت جهاز المصادقة بتاعك. مش هيظهروا تاني بعد ما تكمّل.
          </p>
          <div className="twofa-recovery-grid">
            {recoveryCodes.map((c) => (
              <code key={c} className="twofa-secret">
                {c}
              </code>
            ))}
          </div>
          <div className="modal-actions">
            <button className="small" onClick={finishRecoveryCodes} type="button">
              حفظتهم، كمّل
            </button>
          </div>
        </div>
      )}

      {stage === 'disable' && (
        <div className="security-status-card">
          <p className="modal-text modal-hint">
            اكتب كلمة مرورك وكود التحقق الحالي سوا عشان تلغي الحماية دي:
          </p>
          <input
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            placeholder="كلمة المرور"
          />
          <input
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="الكود المكوّن من 6 أرقام"
            inputMode="numeric"
            maxLength={6}
            onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
          />
          {disableError && <p className="error">{disableError}</p>}
          <div className="modal-actions">
            <button className="small" onClick={() => setStage('idle')} type="button">
              رجوع
            </button>
            <button
              className="danger small"
              onClick={handleDisable}
              disabled={!disablePassword || !disableCode || disableLoading}
              type="button"
            >
              {disableLoading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

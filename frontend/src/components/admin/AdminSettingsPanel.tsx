import { useEffect, useState } from 'react';
import { SiteSettings, getAdminSettings, updateAdminSettings } from '@/lib/api/api';
import { sounds } from '@/lib/audio/sounds';
import { toast } from '@/lib/core/toast';
import AdminConfirmModal from '@/components/admin/AdminConfirmModal';
import { DynamicIcon, IconKey } from '@/lib/core/icons';

const MAINTENANCE_ICONS: IconKey[] = ['wrench', 'construction', 'settings-2', 'settings', 'moon', 'hourglass', 'rocket', 'sparkles'];

function MaintenanceModeCard({
  settings,
  onSaved,
}: {
  settings: SiteSettings;
  onSaved: (s: SiteSettings) => void;
}) {
  const isOn = settings.maintenanceMode === 'true';
  const [message, setMessage] = useState(settings.maintenanceMessage);
  const [emoji, setEmoji] = useState(settings.maintenanceEmoji || 'wrench');
  const [confirmToggle, setConfirmToggle] = useState<null | boolean>(null); // القيمة الجديدة اللي هنحولّها ليها
  const [confirmSave, setConfirmSave] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessage(settings.maintenanceMessage);
    setEmoji(settings.maintenanceEmoji || 'wrench');
  }, [settings.maintenanceMessage, settings.maintenanceEmoji]);

  const dirty = message !== settings.maintenanceMessage || emoji !== (settings.maintenanceEmoji || 'wrench');

  async function doToggle(password: string) {
    setBusy(true);
    try {
      const { settings: s } = await updateAdminSettings(
        { maintenanceMode: String(confirmToggle) },
        password
      );
      onSaved(s);
      sounds.success();
      setConfirmToggle(null);
      toast.success(confirmToggle ? 'اتفعّل وضع الصيانة — الموقع دلوقتي مقفول على المستخدمين العاديين' : 'اتلغى وضع الصيانة — الموقع رجع يشتغل لكل الناس');
    } finally {
      setBusy(false);
    }
  }

  async function doSaveDetails(password: string) {
    setBusy(true);
    try {
      const { settings: s } = await updateAdminSettings(
        { maintenanceMessage: message, maintenanceEmoji: emoji },
        password
      );
      onSaved(s);
      sounds.success();
      setConfirmSave(false);
      toast.success('اتحفظت رسالة وأيقونة الصيانة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`maintenance-mode-card ${isOn ? 'is-on' : ''}`}>
      <div className="maintenance-mode-card-header">
        <div className="maintenance-mode-status">
          <span className={`status-dot ${isOn ? 'on' : 'off'}`} />
          <div>
            <strong>وضع الصيانة</strong>
            <p>{isOn ? 'مفعّل حاليًا — الموقع مقفول على المستخدمين العاديين' : 'الموقع شغال بشكل طبيعي لكل الناس'}</p>
          </div>
        </div>
        <button
          type="button"
          className={`maintenance-switch ${isOn ? 'on' : ''}`}
          onClick={() => setConfirmToggle(!isOn)}
          disabled={busy}
          aria-pressed={isOn}
          aria-label="تبديل وضع الصيانة"
        >
          <span className="maintenance-switch-knob" />
        </button>
      </div>

      <div className="maintenance-mode-details">
        <div className="settings-field">
          <label>الأيقونة اللي هتظهر للزوار</label>
          <div className="emoji-picker">
            {MAINTENANCE_ICONS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-option ${emoji === e ? 'selected' : ''}`}
                onClick={() => setEmoji(e)}
                aria-label={`اختيار ${e}`}
              >
                <DynamicIcon name={e} size={20} />
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <label>الرسالة اللي هتظهر للزوار وقت الصيانة</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="مثال: بنعمل تحديثات على الموقع، هنرجع قريب"
          />
        </div>

        <div className="maintenance-preview">
          <div className="maintenance-preview-icon"><DynamicIcon name={emoji} fallback="wrench" size={24} /></div>
          <div>
            <strong>{settings.siteName || 'الموقع'} تحت الصيانة</strong>
            <p>{message || 'اكتب رسالة عشان تظهر هنا...'}</p>
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button
            className="small"
            type="button"
            disabled={!dirty || busy}
            onClick={() => setConfirmSave(true)}
          >
            حفظ الرسالة والأيقونة
          </button>
        </div>
      </div>

      {confirmToggle !== null && (
        <AdminConfirmModal
          title={confirmToggle ? 'تفعيل وضع الصيانة؟' : 'إلغاء وضع الصيانة؟'}
          description={
            <p>
              {confirmToggle
                ? 'هيتقفل الموقع فورًا على كل المستخدمين العاديين، وهيفضلوا شايفين صفحة الصيانة لحد ما تلغيها. أنت هتفضل شايف الموقع عادي كأدمن.'
                : 'الموقع هيرجع يشتغل فورًا لكل المستخدمين.'}
            </p>
          }
          danger={!!confirmToggle}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={doToggle}
        />
      )}

      {confirmSave && (
        <AdminConfirmModal
          title="حفظ رسالة الصيانة"
          description={<p>هيتحدّث النص والأيقونة اللي بتظهر للزوار وقت الصيانة.</p>}
          onCancel={() => setConfirmSave(false)}
          onConfirm={doSaveDetails}
        />
      )}
    </div>
  );
}

export default function AdminSettingsPanel() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { settings: s } = await getAdminSettings();
        setSettings(s);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تعذّر تحميل الإعدادات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function update<K extends keyof SiteSettings>(key: K, value: string) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(password: string) {
    if (!settings) return;
    const { settings: s } = await updateAdminSettings(settings, password);
    setSettings(s);
    sounds.success();
    setConfirming(false);
    toast.success('اتحفظت الإعدادات');
  }

  if (loading) return <div className="skeleton" style={{ height: 300 }} />;
  if (!settings) return null;

  return (
    <div className="admin-settings-panel admin-panel">
      <h2>إعدادات الموقع العامة</h2>

      <MaintenanceModeCard settings={settings} onSaved={setSettings} />

      <div className="settings-field">
        <label>اسم الموقع</label>
        <input value={settings.siteName} onChange={(e) => update('siteName', e.target.value)} />
      </div>

      <div className="settings-field checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={settings.registrationEnabled === 'true'}
            onChange={(e) => update('registrationEnabled', String(e.target.checked))}
          />
          السماح بتسجيل حسابات جديدة
        </label>
      </div>

      <div className="settings-field">
        <label>أقصى عدد قوائم لكل مستخدم (0 = غير محدود)</label>
        <input
          type="number"
          min={0}
          value={settings.maxListsPerUser}
          onChange={(e) => update('maxListsPerUser', e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label>أقصى عدد مهام لكل قائمة (0 = غير محدود)</label>
        <input
          type="number"
          min={0}
          value={settings.maxItemsPerList}
          onChange={(e) => update('maxItemsPerList', e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label>بانر إعلان (يظهر لكل المستخدمين، سيبه فاضي عشان يختفي)</label>
        <input value={settings.announcementBanner} onChange={(e) => update('announcementBanner', e.target.value)} />
      </div>

      <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 18 }}>
        <button className="small" onClick={() => setConfirming(true)} type="button">
          حفظ باقي الإعدادات
        </button>
      </div>

      {confirming && (
        <AdminConfirmModal
          title="تأكيد حفظ الإعدادات"
          description={<p>الإعدادات دي بتأثر على الموقع كله لكل المستخدمين.</p>}
          onCancel={() => setConfirming(false)}
          onConfirm={save}
        />
      )}
    </div>
  );
}

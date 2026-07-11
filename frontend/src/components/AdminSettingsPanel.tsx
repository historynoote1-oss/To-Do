import { useEffect, useState } from 'react';
import { SiteSettings, getAdminSettings, updateAdminSettings } from '../lib/api';
import { sounds } from '../lib/sounds';
import { toast } from '../lib/toast';
import AdminConfirmModal from './AdminConfirmModal';

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

      <div className="settings-field checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={settings.maintenanceMode === 'true'}
            onChange={(e) => update('maintenanceMode', String(e.target.checked))}
          />
          وضع الصيانة (يمنع دخول المستخدمين العاديين مؤقتًا)
        </label>
      </div>

      <div className="settings-field">
        <label>رسالة الصيانة</label>
        <input value={settings.maintenanceMessage} onChange={(e) => update('maintenanceMessage', e.target.value)} />
      </div>

      <div className="settings-field">
        <label>أقصى عدد قوائم لكل مستخدم (0 = بدون حد)</label>
        <input
          type="number"
          min={0}
          value={settings.maxListsPerUser}
          onChange={(e) => update('maxListsPerUser', e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label>أقصى عدد مهام لكل قائمة (0 = بدون حد)</label>
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
          حفظ كل الإعدادات
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

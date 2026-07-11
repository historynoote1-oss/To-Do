import { useEffect, useState } from 'react';
import {
  getProfile,
  updateProfile,
  changeOwnPassword,
  regenerateOwnRecoveryCode,
  ProfileData,
  ProfileStats,
} from '../lib/api';
import { PRIORITIES, PriorityKey } from '../lib/priority';
import { toast } from '../lib/toast';
import { sounds } from '../lib/sounds';

const PRIORITY_ORDER: PriorityKey[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export default function Profile({
  onBack,
  onDisplayNameChange,
}: {
  onBack: () => void;
  onDisplayNameChange?: (name: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [emojis, setEmojis] = useState<string[]>([]);

  // ---- نموذج تعديل الملف الشخصي ----
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarColor, setAvatarColor] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ---- نموذج تغيير كلمة المرور ----
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // ---- توليد كود استرجاع جديد ----
  const [showRegen, setShowRegen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [regenConfirmed, setRegenConfirmed] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data.profile);
      setStats(data.stats);
      setColors(data.avatarOptions.colors);
      setEmojis(data.avatarOptions.emojis);
      setDisplayName(data.profile.displayName || '');
      setBio(data.profile.bio || '');
      setAvatarColor(data.profile.avatarColor);
      setAvatarEmoji(data.profile.avatarEmoji);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await updateProfile({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        avatarColor,
        avatarEmoji,
      });
      setProfile(res.profile);
      onDisplayNameChange?.(res.profile.displayName);
      sounds.success();
      toast.success('اتحفظ الملف الشخصي ✅');
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ الملف الشخصي');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) return;
    setChangingPassword(true);
    setPasswordError(null);
    try {
      const res = await changeOwnPassword(currentPassword, newPassword, confirmNewPassword);
      localStorage.setItem('token', res.token);
      sounds.success();
      toast.success(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      sounds.error();
      setPasswordError(err instanceof Error ? err.message : 'فشلت عملية تغيير كلمة المرور');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRegenerate() {
    if (!regenPassword) return;
    setRegenLoading(true);
    setRegenError(null);
    try {
      const res = await regenerateOwnRecoveryCode(regenPassword);
      setNewRecoveryCode(res.recoveryCode);
      sounds.success();
    } catch (err) {
      sounds.error();
      setRegenError(err instanceof Error ? err.message : 'فشلت عملية توليد الكود');
    } finally {
      setRegenLoading(false);
    }
  }

  function finishRegen() {
    setShowRegen(false);
    setNewRecoveryCode(null);
    setRegenPassword('');
    setRegenConfirmed(false);
  }

  function handleCopyCode() {
    if (!newRecoveryCode) return;
    navigator.clipboard?.writeText(newRecoveryCode).then(
      () => toast.success('اتنسخ الكود ✅'),
      () => toast.error('متقدرش أنسخ الكود، انسخه يدويًا')
    );
    sounds.click();
  }

  if (loading || !profile || !stats) {
    return (
      <div className="container view-fade profile-page">
        <div className="skeleton skeleton-card" style={{ height: 220, marginBottom: 16 }} />
        <div className="skeleton skeleton-card" style={{ height: 120 }} />
      </div>
    );
  }

  const initials = (profile.displayName || profile.username).trim().charAt(0).toUpperCase();
  const totalPriority = Object.values(stats.priority).reduce((a, b) => a + b, 0);

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <button className="small" onClick={onBack} type="button">
          رجوع
        </button>
        <strong>الملف الشخصي</strong>
        <span aria-hidden="true" style={{ width: 0 }} />
      </div>

      <div className="profile-hero">
        <div className="profile-avatar" style={{ background: avatarColor }} aria-hidden="true">
          {avatarEmoji || initials}
        </div>
        <div className="profile-hero-info">
          <h1>{profile.displayName || profile.username}</h1>
          <span className="profile-username">@{profile.username}</span>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <div className="profile-badges">
            {profile.isAdmin && <span className="twofa-badge twofa-on">أدمن</span>}
            <span className="profile-meta">
              عضو منذ {new Date(profile.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
      </div>

      <div className="stats-row profile-stats-row">
        <div className="stat-card">
          <span className="stat-card-value">{stats.totalLists}</span>
          <span className="stat-card-label">إجمالي المهام الرئيسية</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value stat-card-success">{stats.completedLists}</span>
          <span className="stat-card-label">مكتملة بالكامل</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{stats.completionRate}%</span>
          <span className="stat-card-label">
            نسبة الإنجاز ({stats.doneItems}/{stats.totalItems})
          </span>
        </div>
      </div>

      {totalPriority > 0 && (
        <div className="admin-panel profile-section">
          <h2>توزيع مهامك حسب الأولوية</h2>
          <div className="priority-bars">
            {PRIORITY_ORDER.map((p) => {
              const count = stats.priority[p];
              const pct = totalPriority > 0 ? Math.round((count / totalPriority) * 100) : 0;
              const def = PRIORITIES.find((x) => x.key === p)!;
              return (
                <div className="priority-row" key={p}>
                  <span className="priority-row-label">{def.label}</span>
                  <div className="priority-row-track">
                    <div
                      className="priority-row-fill"
                      style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%`, background: def.color }}
                    />
                  </div>
                  <span className="priority-row-count">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="security-panel profile-section">
        <h2>✏️ تعديل الملف الشخصي</h2>
        <div className="security-status-card">
          <div className="settings-field">
            <label>اسم العرض (اختياري)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={profile.username}
              maxLength={40}
            />
          </div>
          <div className="settings-field">
            <label>نبذة مختصرة (اختياري)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="اكتب سطر بسيط عن نفسك..."
              maxLength={160}
              rows={2}
            />
          </div>
          <div className="settings-field">
            <label>لون الأفتار</label>
            <div className="avatar-color-picker">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`avatar-color-option ${avatarColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    setAvatarColor(c);
                    sounds.hover();
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="settings-field">
            <label>إيموجي الأفتار (اختياري)</label>
            <div className="emoji-picker">
              <button
                type="button"
                className={`emoji-option ${!avatarEmoji ? 'selected' : ''}`}
                onClick={() => setAvatarEmoji(null)}
                title="الحروف الأولى من اسمك"
              >
                {initials}
              </button>
              {emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`emoji-option ${avatarEmoji === e ? 'selected' : ''}`}
                  onClick={() => setAvatarEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button onClick={handleSaveProfile} disabled={savingProfile} type="button">
              {savingProfile ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        </div>
      </div>

      <div className="security-panel profile-section">
        <h2>🔒 كلمة المرور</h2>
        <div className="security-status-card">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="كلمة المرور الحالية"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="كلمة المرور الجديدة"
          />
          <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="تأكيد كلمة المرور الجديدة"
            onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
          />
          {passwordError && <p className="error">{passwordError}</p>}
          <div className="modal-actions">
            <button
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword || changingPassword}
              type="button"
            >
              {changingPassword ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </button>
          </div>
        </div>
      </div>

      <div className="security-panel profile-section">
        <h2>🔑 كود الاسترجاع</h2>
        <p className="modal-text">
          لو نسيت كلمة المرور، بتسترجع حسابك بكود الاسترجاع بدل الإيميل. لو حاسس إن الكود ضاع منك أو حد ممكن يكون
          شافه، تقدر تولّد كود جديد يحل محله فورًا.
        </p>
        {!showRegen && (
          <div className="security-status-actions">
            <button className="small" onClick={() => setShowRegen(true)} type="button">
              توليد كود جديد
            </button>
          </div>
        )}
        {showRegen && !newRecoveryCode && (
          <div className="security-status-card">
            <p className="modal-text modal-hint">
              اكتب كلمة مرورك الحالية عشان تولّد كود استرجاع جديد (الكود القديم هيبقى غير صالح فورًا):
            </p>
            <input
              type="password"
              value={regenPassword}
              onChange={(e) => setRegenPassword(e.target.value)}
              placeholder="كلمة المرور"
              onKeyDown={(e) => e.key === 'Enter' && handleRegenerate()}
            />
            {regenError && <p className="error">{regenError}</p>}
            <div className="modal-actions">
              <button className="small" onClick={() => setShowRegen(false)} type="button">
                إلغاء
              </button>
              <button className="small" onClick={handleRegenerate} disabled={!regenPassword || regenLoading} type="button">
                {regenLoading ? 'جاري التوليد...' : 'توليد الكود'}
              </button>
            </div>
          </div>
        )}
        {newRecoveryCode && (
          <div className="security-status-card">
            <div className="recovery-code-box">{newRecoveryCode}</div>
            <button type="button" className="small" onClick={handleCopyCode}>
              📋 نسخ الكود
            </button>
            <div className="recovery-code-warning">
              ⚠️ ده بقى الكود الوحيد الصالح لحسابك — الكود القديم بقى ملغي. احفظه في مكان آمن، مش هيتعرض تاني بعد ما
              تسيب الصفحة دي.
            </div>
            <label className="recovery-code-confirm">
              <input type="checkbox" checked={regenConfirmed} onChange={(e) => setRegenConfirmed(e.target.checked)} />
              حفظت الكود في مكان آمن
            </label>
            <button type="button" disabled={!regenConfirmed} onClick={finishRegen}>
              تم
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

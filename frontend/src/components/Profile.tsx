import { useEffect, useRef, useState } from 'react';
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  removeAvatar,
  resolveAvatarUrl,
  changeOwnPassword,
  regenerateOwnRecoveryCode,
  ProfileData,
  ProfileStats,
} from '../lib/api';
import { PRIORITIES, PriorityKey } from '../lib/priority';
import { toast } from '../lib/toast';
import { sounds } from '../lib/sounds';
import { DynamicIcon } from '../lib/icons';
import BackButton from './BackButton';

const PRIORITY_ORDER: PriorityKey[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export default function Profile({
  onBack,
  onDisplayNameChange,
  onAvatarChange,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onDisplayNameChange?: (name: string | null) => void;
  onAvatarChange?: (avatarUrl: string | null) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  // ---- نموذج تعديل الملف الشخصي ----
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ---- نموذج تغيير كلمة المرور ----
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // ---- إعدادات الأصوات ----
  const [soundsEnabled, setSoundsEnabled] = useState(() => !sounds.isMuted());
  const [soundVolume, setSoundVolume] = useState(() => sounds.getVolume());

  useEffect(() => {
    return sounds.subscribe(({ muted, volume }) => {
      setSoundsEnabled(!muted);
      setSoundVolume(volume);
    });
  }, []);

  function handleToggleSounds() {
    const enabled = !soundsEnabled;
    sounds.setMuted(!enabled);
    if (enabled) sounds.click();
  }

  function handleVolumeChange(value: number) {
    sounds.setVolume(value);
  }

  function handleVolumeCommit(value: number) {
    // بنسمّع النغمة بس لحظة ما المستخدم يسيب الشريط، مش مع كل حركة صغيرة،
    // عشان منزعجهوش بسيل من الأصوات وهو لسه بيظبط المستوى.
    sounds.setVolume(value, { preview: true });
  }

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
    setLoadError(null);
    try {
      const data = await getProfile();
      setProfile(data.profile);
      setStats(data.stats);
      setDisplayName(data.profile.displayName || '');
      setBio(data.profile.bio || '');
      setAvatarUrl(data.profile.avatarUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر تحميل الملف الشخصي';
      setLoadError(message);
      toast.error(message);
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
      });
      setProfile(res.profile);
      onDisplayNameChange?.(res.profile.displayName);
      sounds.success();
      toast.success('اتحفظ الملف الشخصي');
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حفظ الملف الشخصي');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // يسمح باختيار نفس الملف تاني لو احتاج المستخدم كده
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      sounds.error();
      toast.error('الصورة لازم تكون JPG أو PNG أو WEBP أو GIF');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      sounds.error();
      toast.error('حجم الصورة أكبر من 3 ميجابايت');
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await uploadAvatar(file);
      setAvatarUrl(res.profile.avatarUrl);
      onAvatarChange?.(res.profile.avatarUrl);
      sounds.success();
      toast.success('اتغيّرت صورة الأفتار');
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر رفع الصورة');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const res = await removeAvatar();
      setAvatarUrl(res.profile.avatarUrl);
      onAvatarChange?.(res.profile.avatarUrl);
      sounds.click();
      toast.success('اتشالت صورة الأفتار');
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف الصورة');
    } finally {
      setUploadingAvatar(false);
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
      () => toast.success('اتنسخ الكود'),
      () => toast.error('متقدرش أنسخ الكود، انسخه يدويًا')
    );
    sounds.click();
  }

  if (loading) {
    return (
      <div className="container view-fade profile-page">
        <div className="skeleton skeleton-card" style={{ height: 220, marginBottom: 16 }} />
        <div className="skeleton skeleton-card" style={{ height: 120 }} />
      </div>
    );
  }

  if (loadError || !profile || !stats) {
    return (
      <div className="container view-fade profile-page">
        <div className="top-bar">
          <div className="top-bar-main">
            <BackButton onClick={onBack} />
            <strong>الملف الشخصي</strong>
          </div>
        </div>
        <p className="empty">
          <DynamicIcon name="alert" size={32} className="empty-icon" />
          {loadError || 'تعذّر تحميل الملف الشخصي'}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={load}>
            <DynamicIcon name="undo" size={14} /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const initials = (profile.displayName || profile.username).trim().charAt(0).toUpperCase();
  const totalPriority = Object.values(stats.priority).reduce((a, b) => a + b, 0);

  return (
    <div className="container view-fade profile-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>الملف الشخصي</strong>
          <button
            className="icon-btn hamburger-btn"
            onClick={onOpenMenu}
            type="button"
            title="القائمة"
            aria-label="فتح القائمة"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className="profile-hero">
        <div className="profile-avatar">
          {avatarUrl ? (
            <img src={resolveAvatarUrl(avatarUrl) ?? undefined} alt="" />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
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
        <h2><DynamicIcon name="volume-high" size={18} /> إعدادات الصوت</h2>
        <div className="security-status-card">
          <div className="settings-field checkbox-row sound-toggle-row">
            <label htmlFor="sounds-enabled-toggle">
              <input
                id="sounds-enabled-toggle"
                type="checkbox"
                checked={soundsEnabled}
                onChange={handleToggleSounds}
              />
              تفعيل أصوات الموقع
            </label>
            <span className="modal-hint sound-toggle-hint">
              أصوات قصيرة ومريحة لإضافة وحذف وتعديل المهام والتذكيرات والإشعارات
            </span>
          </div>
          <div className="settings-field">
            <label htmlFor="sounds-volume-slider">
              مستوى الصوت
              <span className="sound-volume-value">{soundsEnabled ? `${soundVolume}%` : 'مكتوم'}</span>
            </label>
            <input
              id="sounds-volume-slider"
              type="range"
              className="sound-volume-slider"
              min={0}
              max={100}
              step={5}
              value={soundVolume}
              disabled={!soundsEnabled}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              onMouseUp={(e) => handleVolumeCommit(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleVolumeCommit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => handleVolumeCommit(Number((e.target as HTMLInputElement).value))}
              aria-label="مستوى صوت الموقع"
            />
          </div>
        </div>
      </div>

      <div className="security-panel profile-section">
        <h2><DynamicIcon name="pencil" size={18} /> تعديل الملف الشخصي</h2>
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
            <label>صورة الأفتار</label>
            <div className="avatar-edit-wrap">
              <div className={`avatar-upload-preview ${uploadingAvatar ? 'is-loading' : ''}`}>
                {avatarUrl ? (
                  <img src={resolveAvatarUrl(avatarUrl) ?? undefined} alt="" />
                ) : (
                  <span aria-hidden="true">{initials}</span>
                )}
                {uploadingAvatar && <span className="avatar-upload-spinner" aria-hidden="true" />}
              </div>
              <button
                type="button"
                className="avatar-edit-icon-btn avatar-edit-icon-btn-primary"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title={avatarUrl ? 'تغيير الصورة' : 'رفع صورة'}
                aria-label={avatarUrl ? 'تغيير الصورة' : 'رفع صورة'}
              >
                <DynamicIcon name="pencil" size={14} />
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="avatar-edit-icon-btn avatar-edit-icon-btn-danger"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                  title="حذف الصورة"
                  aria-label="حذف الصورة"
                >
                  <DynamicIcon name="trash" size={14} />
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarSelect}
                hidden
              />
            </div>
            <p className="modal-hint">JPG أو PNG أو WEBP أو GIF — أقل من 3 ميجابايت</p>
          </div>
          <div className="modal-actions">
            <button onClick={handleSaveProfile} disabled={savingProfile} type="button">
              {savingProfile ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        </div>
      </div>

      <div className="security-panel profile-section">
        <h2><DynamicIcon name="lock" size={18} /> كلمة المرور</h2>
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
        <h2><DynamicIcon name="key" size={18} /> كود الاسترجاع</h2>
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
              <DynamicIcon name="clipboard-list" size={14} /> نسخ الكود
            </button>
            <div className="recovery-code-warning">
              <DynamicIcon name="alert" size={14} /> ده بقى الكود الوحيد الصالح لحسابك — الكود القديم بقى ملغي. احفظه في مكان آمن، مش هيتعرض تاني بعد ما
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

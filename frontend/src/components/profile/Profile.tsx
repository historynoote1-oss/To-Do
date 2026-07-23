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
} from '@/lib/api/api';
import { toast } from '@/lib/core/toast';
import { sounds } from '@/lib/audio/sounds';
import { DynamicIcon } from '@/lib/core/icons';
import BackButton from '@/components/layout/BackButton';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

// تنسيق تاريخ كامل بالتفصيل: السنة والشهر واليوم والساعة والدقيقة.
function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

  if (loadError || !profile) {
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
  const isDirty = displayName.trim() !== (profile.displayName || '') || bio.trim() !== (profile.bio || '');

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

      {/* ===== 1. معلومات المستخدم ===== */}
      <div className="profile-identity-card profile-section">
        <div className="profile-identity-top">
          <div className="profile-avatar-wrap">
            <div className={`profile-avatar-circle ${uploadingAvatar ? 'is-loading' : ''}`}>
              {avatarUrl ? (
                <img src={resolveAvatarUrl(avatarUrl) ?? undefined} alt="" />
              ) : (
                <span aria-hidden="true">{initials}</span>
              )}
              {uploadingAvatar && <span className="avatar-upload-spinner" aria-hidden="true" />}
            </div>
            <div className="profile-avatar-actions">
              <button
                type="button"
                className="profile-avatar-btn profile-avatar-btn-edit"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title={avatarUrl ? 'تغيير الصورة' : 'رفع صورة'}
                aria-label={avatarUrl ? 'تغيير الصورة' : 'رفع صورة'}
              >
                <DynamicIcon name="pencil" size={13} />
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="profile-avatar-btn profile-avatar-btn-remove"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                  title="حذف الصورة"
                  aria-label="حذف الصورة"
                >
                  <DynamicIcon name="trash" size={13} />
                </button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarSelect}
              hidden
            />
          </div>

          <div className="profile-identity-fields">
            <input
              className="profile-name-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={profile.username}
              maxLength={40}
              aria-label="اسم العرض"
            />
            <div className="profile-username-row">
              <span className="profile-username-badge">@{profile.username}</span>
              {profile.isAdmin && <span className="twofa-badge twofa-on">أدمن</span>}
            </div>
          </div>
        </div>

        <textarea
          className="profile-bio-input"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="اكتب سطر بسيط عن نفسك..."
          maxLength={160}
          rows={2}
          aria-label="نبذة مختصرة"
        />

        <div className="profile-meta-chips">
          <span className="profile-meta-chip">
            <DynamicIcon name="calendar-days" size={13} /> عضو منذ {formatFullDateTime(profile.createdAt)}
          </span>
          {profile.lastLoginAt && (
            <span className="profile-meta-chip">
              <DynamicIcon name="history" size={13} /> آخر دخول {formatFullDateTime(profile.lastLoginAt)}
            </span>
          )}
        </div>

        {isDirty && (
          <div className="profile-save-row">
            <button onClick={handleSaveProfile} disabled={savingProfile} type="button">
              {savingProfile ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        )}
        <p className="modal-hint" style={{ marginTop: 10 }}>
          JPG أو PNG أو WEBP أو GIF — أقل من 3 ميجابايت
        </p>
      </div>

      {/* ===== 2. كلمة المرور والأمان ===== */}
      <div className="profile-security-card profile-section">
        <h2>
          <DynamicIcon name="shield-check" size={18} /> كلمة المرور والأمان
        </h2>

        <h3>
          <DynamicIcon name="lock" size={16} /> تغيير كلمة المرور
        </h3>
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

        <h3>
          <DynamicIcon name="key" size={16} /> كود الاسترجاع
        </h3>
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

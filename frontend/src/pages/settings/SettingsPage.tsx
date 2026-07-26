import { useEffect, useState } from 'react';
import BackButton from '@/components/layout/BackButton';
import { DynamicIcon } from '@/utils/icons';
import { getProfile, resolveAvatarUrl, ProfileData } from '@/services/api';
import { toast } from '@/utils/toast';
import { sounds } from '@/services/audio/sounds';
import { useThemePreference, ThemePreference } from '@/utils/theme';
import { usePrayerTimes } from '@/hooks/prayerTimesStore';
import { PRAYER_LABELS, formatCountdown } from '@/services/prayer/prayerTimes';
import { isNativeApp } from '@/services/audio/nativeAdhan';
import { PushSupportState } from '@/services/notifications/push';

const APP_VERSION = '1.0.0';

// تسمية كل حالة من حالات إشعارات الجهاز — بنفس القيم المستخدمة في
// App.tsx/SideMenu لكن بعرض أوضح ومفصّل هنا (صفحة مستقلة مساحتها أكبر).
function pushStatusLabel(state: PushSupportState): string {
  switch (state) {
    case 'subscribed':
      return 'مفعّلة على الجهاز ده';
    case 'denied':
      return 'ممنوعة من إعدادات المتصفح';
    case 'unsupported':
      return 'الجهاز/المتصفح ده مش بيدعمها';
    default:
      return 'غير مفعّلة';
  }
}

export default function SettingsPage({
  onBack,
  onOpenMenu,
  menuOpen,
  isAdmin,
  muted,
  onToggleMute,
  pushState,
  onTogglePush,
  onOpenProfile,
  onOpenLifeAreas,
  onOpenGoalMap,
  onOpenPlayer,
  onOpenPomodoro,
  onOpenPrayerTimes,
  onOpenDashboard,
  onRequestLogout,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  isAdmin: boolean;
  muted: boolean;
  onToggleMute: () => void;
  pushState: PushSupportState;
  onTogglePush: () => void;
  onOpenProfile: () => void;
  onOpenLifeAreas: () => void;
  onOpenGoalMap: () => void;
  onOpenPlayer: () => void;
  onOpenPomodoro: () => void;
  onOpenPrayerTimes: () => void;
  onOpenDashboard: () => void;
  onRequestLogout: () => void;
}) {
  // ===== 1. ملخص الحساب — تحميل بيانات خفيف، باقي الصفحة شغّالة من
  // غير أي API فور ما المستخدم يفتحها (ثيم/صوت/أذان كلها محلية). =====
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((data) => {
        if (!cancelled) setProfile(data.profile);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'تعذّر تحميل بيانات الحساب');
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== 2. المظهر (فاتح / غامق / تلقائي حسب النظام) =====
  const [themePref, setThemePref] = useThemePreference();

  // ===== 3. الصوت (كتم + مستوى) — متزامن مع زرار الهيدر وأي مكان تاني =====
  const [volume, setVolumeState] = useState(() => sounds.getVolume());
  useEffect(() => sounds.subscribe(({ volume: v }) => setVolumeState(v)), []);

  function handleVolumeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolumeState(v);
    sounds.setVolume(v);
  }
  function handleVolumeCommit() {
    sounds.setVolume(volume, { preview: true });
  }

  // ===== 4. الأذان ومواقيت الصلاة — إعدادات سريعة بس، الإعدادات الكاملة
  // (طريقة الحساب، المذهب، القارئ، التذكيرات المخصّصة...) موجودة في صفحة
  // "مواقيت الصلاة" نفسها عشان منكررش نفس الواجهة في مكانين. =====
  const { settings: prayerSettings, updateSettings: updatePrayerSettings, location: prayerLocation, nextPrayer } =
    usePrayerTimes();

  const initials = (profile?.displayName || profile?.username || '؟').trim().charAt(0).toUpperCase();

  const THEME_OPTIONS: { key: ThemePreference; label: string; icon: 'sun' | 'moon' | 'laptop' }[] = [
    { key: 'light', label: 'فاتح', icon: 'sun' },
    { key: 'dark', label: 'غامق', icon: 'moon' },
    { key: 'system', label: 'تلقائي', icon: 'laptop' },
  ];

  return (
    <div className="container view-fade profile-page settings-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>الإعدادات</strong>
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

      {/* ===== ملخص الحساب ===== */}
      <div className="profile-identity-card profile-section settings-account-card">
        {profileLoading ? (
          <div className="skeleton" style={{ height: 84 }} />
        ) : (
          <div className="profile-identity-top">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-circle">
                {profile?.avatarUrl && !avatarLoadFailed ? (
                  <img
                    src={resolveAvatarUrl(profile.avatarUrl) ?? undefined}
                    alt=""
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <span aria-hidden="true">{initials}</span>
                )}
              </div>
            </div>
            <div className="profile-identity-fields">
              <strong className="settings-account-name">{profile?.displayName || profile?.username}</strong>
              <div className="profile-username-row">
                <span className="profile-username-badge">@{profile?.username}</span>
                {profile?.isAdmin && <span className="twofa-badge twofa-on">أدمن</span>}
              </div>
            </div>
            <button className="settings-account-edit" onClick={onOpenProfile} type="button" title="فتح الملف الشخصي الكامل">
              <DynamicIcon name="pencil" size={13} /> تعديل
            </button>
          </div>
        )}
      </div>

      {/* ===== الأمان ===== */}
      <section className="list-card profile-section" aria-label="الأمان" style={{ ['--card-accent' as any]: 'var(--danger)' }}>
        <h2>
          <DynamicIcon name="shield-check" size={18} /> الأمان
        </h2>
        <p className="modal-text modal-hint">
          حماية حسابك بكلمة مرور قوية وكود استرجاع، عشان محدش يقدر يدخل حسابك غيرك.
        </p>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenProfile}>
          <DynamicIcon name="lock" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">كلمة المرور وكود الاسترجاع</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
      </section>

      {/* ===== المظهر ===== */}
      <section className="list-card profile-section" aria-label="المظهر" style={{ ['--card-accent' as any]: 'var(--accent)' }}>
        <h2>
          <DynamicIcon name="palette" size={18} /> المظهر
        </h2>
        <p className="modal-text modal-hint">اختر شكل الواجهة، أو سيبها تتبع إعداد جهازك تلقائيًا.</p>
        <div className="prayer-segmented settings-segmented">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={themePref === opt.key ? 'active' : ''}
              onClick={() => setThemePref(opt.key)}
              aria-pressed={themePref === opt.key}
            >
              <DynamicIcon name={opt.icon} size={14} /> {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ===== الصوت ===== */}
      <section className="list-card profile-section" aria-label="الصوت" style={{ ['--card-accent' as any]: 'var(--info)' }}>
        <h2>
          <DynamicIcon name="volume-high" size={18} /> الصوت
        </h2>
        <button
          type="button"
          className="side-menu-item side-menu-toggle-item settings-toggle-item"
          onClick={onToggleMute}
          aria-pressed={!muted}
        >
          <DynamicIcon name={muted ? 'volume-off' : 'volume-high'} size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">أصوات التطبيق (تنبيهات، أزرار)</span>
          <span className={`side-menu-switch ${!muted ? 'on' : ''}`} aria-hidden="true">
            <span className="side-menu-switch-knob" />
          </span>
        </button>
        <label className="prayer-field prayer-volume-field settings-volume-field">
          <span>مستوى الصوت — {volume}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            disabled={muted}
            onChange={handleVolumeInput}
            onMouseUp={handleVolumeCommit}
            onTouchEnd={handleVolumeCommit}
            onKeyUp={handleVolumeCommit}
            aria-label="مستوى صوت التطبيق"
          />
        </label>
      </section>

      {/* ===== الإشعارات ===== */}
      <section className="list-card profile-section" aria-label="الإشعارات" style={{ ['--card-accent' as any]: 'var(--success)' }}>
        <h2>
          <DynamicIcon name="bell" size={18} /> الإشعارات
        </h2>
        <p className="modal-text modal-hint">
          إشعارات الجهاز بتوصّلك حتى لو التطبيق مقفول — للتذكيرات والمهام المستحقة ومواقيت الصلاة.
        </p>
        <button
          type="button"
          className="side-menu-item side-menu-toggle-item settings-toggle-item"
          onClick={onTogglePush}
          disabled={pushState === 'unsupported'}
          aria-pressed={pushState === 'subscribed'}
        >
          <DynamicIcon name={pushState === 'subscribed' ? 'bell' : 'bell-off'} size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label-col">
            <span className="side-menu-item-label">إشعارات الجهاز</span>
            <span className="side-menu-prayer-sub">{pushStatusLabel(pushState)}</span>
          </span>
          <span className={`side-menu-switch ${pushState === 'subscribed' ? 'on' : ''}`} aria-hidden="true">
            <span className="side-menu-switch-knob" />
          </span>
        </button>
        {pushState === 'denied' && (
          <p className="modal-hint">
            <DynamicIcon name="alert" size={13} /> اتمنعت من إعدادات المتصفح/الجهاز — لازم تفعّلها من هناك الأول ثم ترجع هنا.
          </p>
        )}
      </section>

      {/* ===== الأذان ومواقيت الصلاة ===== */}
      <section className="list-card profile-section" aria-label="الأذان ومواقيت الصلاة" style={{ ['--card-accent' as any]: 'var(--streak)' }}>
        <h2>
          <DynamicIcon name="moon-star" size={18} /> الأذان ومواقيت الصلاة
        </h2>
        <p className="modal-text modal-hint">
          {prayerLocation ? `موقعك الحالي: ${prayerLocation.label}` : 'لسه محدّدتش موقعك — افتح صفحة مواقيت الصلاة لتحديده.'}
          {nextPrayer && (
            <> — {PRAYER_LABELS[nextPrayer.key]} بعد {formatCountdown(nextPrayer.remainingMs)}</>
          )}
        </p>
        <button
          type="button"
          className="side-menu-item side-menu-toggle-item settings-toggle-item"
          onClick={() => updatePrayerSettings({ autoPlayEnabled: !prayerSettings.autoPlayEnabled })}
          aria-pressed={prayerSettings.autoPlayEnabled}
        >
          <DynamicIcon name="radio" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">تشغيل الأذان تلقائيًا في معاده</span>
          <span className={`side-menu-switch ${prayerSettings.autoPlayEnabled ? 'on' : ''}`} aria-hidden="true">
            <span className="side-menu-switch-knob" />
          </span>
        </button>
        <button
          type="button"
          className="side-menu-item side-menu-toggle-item settings-toggle-item"
          onClick={() => updatePrayerSettings({ is24h: !prayerSettings.is24h })}
          aria-pressed={prayerSettings.is24h}
        >
          <DynamicIcon name="hourglass" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">عرض الوقت بنظام 24 ساعة</span>
          <span className={`side-menu-switch ${prayerSettings.is24h ? 'on' : ''}`} aria-hidden="true">
            <span className="side-menu-switch-knob" />
          </span>
        </button>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenPrayerTimes}>
          <DynamicIcon name="settings-2" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">إعدادات الأذان الكاملة (القارئ، الحساب، التذكيرات...)</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
      </section>

      {/* ===== تنقّل سريع ===== */}
      <section className="list-card profile-section" aria-label="تنقّل سريع" style={{ ['--card-accent' as any]: 'var(--accent-strong)' }}>
        <h2>
          <DynamicIcon name="sliders" size={18} /> أقسام التطبيق
        </h2>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenGoalMap}>
          <DynamicIcon name="route" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">خريطة الأهداف</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenLifeAreas}>
          <DynamicIcon name="compass" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">مجالات الحياة</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenPomodoro}>
          <DynamicIcon name="timer" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">بومودورو</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
        <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenPlayer}>
          <DynamicIcon name="book-open" size={17} className="side-menu-item-icon" />
          <span className="side-menu-item-label">مشغّل القرآن</span>
          <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
        </button>
        {isAdmin && (
          <button type="button" className="side-menu-item settings-nav-row" onClick={onOpenDashboard}>
            <DynamicIcon name="shield-check" size={17} className="side-menu-item-icon" />
            <span className="side-menu-item-label">لوحة التحكم</span>
            <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
          </button>
        )}
      </section>

      {/* ===== عن التطبيق ===== */}
      <section className="list-card profile-section" aria-label="عن التطبيق" style={{ ['--card-accent' as any]: 'var(--border)' }}>
        <h2>
          <DynamicIcon name="info" size={18} /> عن التطبيق
        </h2>
        <div className="profile-meta-chips">
          <span className="profile-meta-chip">
            <DynamicIcon name="tag" size={13} /> الإصدار {APP_VERSION}
          </span>
          <span className="profile-meta-chip">
            <DynamicIcon name={isNativeApp() ? 'smile' : 'globe'} size={13} /> {isNativeApp() ? 'تطبيق موبايل' : 'نسخة الويب'}
          </span>
          {profile?.createdAt && (
            <span className="profile-meta-chip">
              <DynamicIcon name="calendar-days" size={13} /> عضو منذ{' '}
              {new Date(profile.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}
            </span>
          )}
        </div>
      </section>

      {/* ===== تسجيل الخروج ===== */}
      <section
        className="list-card profile-section settings-danger-card"
        aria-label="تسجيل الخروج"
        style={{ ['--card-accent' as any]: 'var(--danger)' }}
      >
        <button className="danger settings-logout-btn" onClick={onRequestLogout} type="button">
          <DynamicIcon name="log-out" size={16} /> تسجيل الخروج
        </button>
      </section>
    </div>
  );
}

import { useState } from 'react';
import AuthForm from './AuthForm';

interface Props {
  emoji: string;
  message: string;
  siteName: string;
  onAdminSuccess: (username: string, isAdmin: boolean) => void;
}

// الصفحة اللي بتظهر لكل الزوار والمستخدمين العاديين وقت الصيانة. مصممة عشان
// تبقى واضحة ومطمّنة (مش شكل خطأ)، وبتفضل تتأكد كل شوية إن الصيانة لسه
// شغالة من غير ما المستخدم يحتاج يعمل refresh بنفسه.
export default function MaintenancePage({ emoji, message, siteName, onAdminSuccess }: Props) {
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <div className="maintenance-icon" aria-hidden="true">
          {emoji || '🛠️'}
        </div>
        <h1>{siteName || 'الموقع'} تحت الصيانة</h1>
        <p className="maintenance-message">{message}</p>
        <div className="maintenance-pulse">
          <span className="maintenance-dot" />
          <span>بنراجع الموقع ونرجعه أول ما نخلص</span>
        </div>
      </div>

      {!showAdminLogin ? (
        <button className="ghost small maintenance-admin-toggle" onClick={() => setShowAdminLogin(true)} type="button">
          دخول كأدمن
        </button>
      ) : (
        <div className="maintenance-admin-login view-fade">
          <AuthForm onSuccess={onAdminSuccess} hideRegister />
        </div>
      )}
    </div>
  );
}

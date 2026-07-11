import { useState } from 'react';
import { toast } from '../lib/toast';
import { sounds } from '../lib/sounds';

// بيتعرض مرة واحدة بس بعد التسجيل / إعادة التأهيل / إعادة تعيين كلمة المرور.
// مفيش أي طريقة تانية تشوف الكود ده تاني بعد ما تسيب الشاشة دي — لازم يحفظه
// دلوقتي، عشان هو بديل استرجاع كلمة المرور بدل الإيميل.
export default function RecoveryCodeReveal({
  code,
  title = 'كود استرجاع حسابك 🔑',
  onContinue,
}: {
  code: string;
  title?: string;
  onContinue: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(code).then(
      () => toast.success('اتنسخ الكود ✅'),
      () => toast.error('متقدرش أنسخ الكود، انسخه يدويًا')
    );
    sounds.click();
  }

  return (
    <div className="auth-container">
      <h1>{title}</h1>
      <div className="auth-form">
        <p className="modal-text modal-hint">
          احفظ الكود ده في مكان آمن — هو الطريقة الوحيدة اللي تقدر بيها تسترجع حسابك لو نسيت كلمة المرور، من غير
          إيميل ولا أي حاجة تانية.
        </p>
        <div className="recovery-code-box">{code}</div>
        <button type="button" className="small" onClick={handleCopy}>
          📋 نسخ الكود
        </button>
        <div className="recovery-code-warning">
          ⚠️ الكود ده مش هيتعرض تاني أبدًا بعد ما تسيب الشاشة دي. لو ضاع منك ومنسيتش كلمة مرورك، تقدر تولّد كود جديد
          وقت ما تحتاج تسترجع الحساب. لو ضاع الكود وكلمة المرور مع بعض، آخر حل إن أدمن الموقع يعمل لك إعادة تعيين من
          لوحة التحكم.
        </div>
        <label className="recovery-code-confirm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          حفظت الكود في مكان آمن
        </label>
        <button type="button" disabled={!confirmed} onClick={onContinue}>
          متابعة
        </button>
      </div>
    </div>
  );
}

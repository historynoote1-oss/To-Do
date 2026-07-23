import { useEffect, useState } from 'react';
import { DynamicIcon } from '@/lib/core/icons';
import { hapticNotification } from '@/lib/core/nativeShell';

// بانر ثابت أعلى الشاشة لما مفيش اتصال بالإنترنت خالص (المرحلة 6).
// بيستمع مباشرة لحدثي 'online'/'offline' على window (مدعومين في كل
// متصفحات الموبايل وجوه WebView بتاع Capacitor برضه)، فمفيش داعي لأي
// polling يدوي. بيفضل ظاهر طول ما الجهاز أوفلاين فعليًا، وبيختفي بحركة
// بسيطة أول ما الاتصال يرجع، مع اهتزاز خفيف في الحالتين عشان المستخدم
// يحس بالتغيير حتى لو مش شايف الشاشة في اللحظة دي.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  // بيتفضل شوية بعد رجوع الاتصال عشان يوري رسالة "رجع الاتصال" واضحة
  // بدل ما يختفي فجأة من غير ما المستخدم يلاحظ إن المشكلة اتحلت.
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setOffline(true);
      setJustReconnected(false);
      void hapticNotification('warning');
    }
    function handleOnline() {
      setOffline(false);
      setJustReconnected(true);
      void hapticNotification('success');
      window.setTimeout(() => setJustReconnected(false), 2500);
    }
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline && !justReconnected) return null;

  return (
    <div className={`offline-banner ${offline ? 'offline' : 'reconnected'}`} role="status" aria-live="polite">
      {offline ? (
        <>
          <DynamicIcon name="wifi-off" size={15} />
          <span>مفيش اتصال بالإنترنت — بعض البيانات ممكن تكون قديمة</span>
        </>
      ) : (
        <>
          <DynamicIcon name="check" size={15} />
          <span>رجع الاتصال بالإنترنت</span>
        </>
      )}
    </div>
  );
}

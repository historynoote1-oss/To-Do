import { createPortal } from 'react-dom';

// أي عنصر جوّه كارت عليه `backdrop-filter` أو `transform` بيبقى "containing
// block" جديد لأي حاجة `position: fixed` جواه — يعني أي مودال يتفتح من جوه
// كارت المهمة (اللي عليه glass blur) بيتحبس داخل حدود الكارت نفسه بدل ما
// يغطي الشاشة كلها، حتى لو كان الـ CSS بتاعه `position: fixed; inset: 0`.
// الحل الوحيد الصحيح هو نخرج المودال فعليًا برا شجرة الـ DOM بتاعت الكارت
// عن طريق React Portal لـ `document.body`، فمفيش أي containing block غريب
// يقدر يأثر عليه.
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

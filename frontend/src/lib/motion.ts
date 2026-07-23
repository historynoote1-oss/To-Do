// مساعدات مركزية لحركة الانتقال بين الشاشات (المرحلة 4 من خطة التطبيق
// الاحترافي). الفكرة: بدل ما نلف كل تبديل شاشة بمكتبة حركة خارجية تقيلة،
// بنستخدم CSS transitions/animations بسيطة (`view-fade` في styles.css)
// وبنتحكم في *اتجاهها* فقط من هنا عن طريق متغير CSS واحد (`--nav-dir`)
// على `<html>` قبل ما الشاشة الجديدة تترسم — يمين↔يسار حسب اتجاه التنقل.

import { ViewName, getViewDepth } from './routes';

// 1  = دخول لشاشة أعمق (يعني التالي عمقه أكبر من أو يساوي الحالي، أو مش
//      رجوع للجذر) → الشاشة الجديدة بتدخل من اليسار.
// -1 = رجوع لشاشة أعلى (التالي هو الجذر `todos` والحالي مش هو) → الشاشة
//      الجديدة (الرئيسية) بتدخل من اليمين، عكس اتجاه الدخول تمامًا، فيحس
//      المستخدم إنه "راجع" مش "داخل مكان جديد".
export type NavDirection = 1 | -1;

export function computeNavDirection(from: ViewName, to: ViewName): NavDirection {
  if (from === to) return 1;
  const fromDepth = getViewDepth(from);
  const toDepth = getViewDepth(to);
  if (toDepth < fromDepth) return -1;
  return 1;
}

// بيحدّث متغير CSS العام قبل ما الـ state يتغيّر، عشان أنيميشن الدخول
// بتاع الشاشة الجديدة (`view-fade` في styles.css) يلاقي القيمة الصح
// جاهزة من أول فريم. آمن الاستدعاء المتكرر — مجرد كتابة property.
export function applyNavDirection(from: ViewName, to: ViewName) {
  if (typeof document === 'undefined') return;
  const dir = computeNavDirection(from, to);
  document.documentElement.style.setProperty('--nav-dir', String(dir));
}

// بيرجّع true لو المستخدم مفعّل "تقليل الحركة" في إعدادات النظام —
// بنستخدمها في مكونات الجافاسكريبت الخالصة (سحب للتحديث، سحب للإجراءات)
// اللي مش ممكن تتحكم فيها بـ CSS media query لوحده، عشان نقصّر أو نلغي
// أي حركة زيادة عن اللازم لمن يفضّل كده.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ===== دوال وثوابت مساعدة صغيرة لخريطة الأهداف =====

import { CategoryKey, categoryOf } from '@/utils/category';

// مدة الضغطة المطوّلة (مللي ثانية) اللازمة عشان تتفعّل عملية حذف السنة —
// أطول من الضغطة العادية اللي بتختار السنة، عشان محدش يحذف بالغلط.
export const LONG_PRESS_MS = 550;

export const CURRENT_YEAR = new Date().getFullYear();
export const MAX_YEAR = 3000;

// ترتيب المستويات الأربعة من قمة الهرم لقاعه — نفس ترتيب الاستخدام في كل
// مكان تاني في الشاشة دي (تبويبات المستوى، حساب الأعداد...).
export const LEVELS: CategoryKey[] = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY'];

export function clampToFutureYear(y: number) {
  return Math.max(CURRENT_YEAR, Math.min(MAX_YEAR, y));
}

// تسمية "أهداف شهرية" (نكرة جمع) — بتُستخدم في قائمة اختيار المستوى بعد
// زرار "إضافة مهام / أهداف".
export function pluralIndefinite(level: CategoryKey): string {
  return `أهداف ${categoryOf(level)!.label}`;
}

// بيحوّل Date لصيغة النص اللي محتاجاها <input type="datetime-local"> (بتوقيت
// الجهاز المحلي، مش UTC). كانت الدالة دي متكررة حرفيًا في AddTaskModal
// وRemindersModal.
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// بيحوّل (أيام/ساعات/دقايق) لنص عربي مقروء زي "يوم و3 ساعات". كانت الدالة
// دي متكررة في نفس الملفين بفرق بسيط (نسخة AddTaskModal ماكانتش بترجع
// "0 دقيقة" لو كل القيم صفر)؛ اتوحّدت هنا على النسخة الأكمل.
export function formatOffsetParts(days: number, hours: number, minutes: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`);
  if (hours > 0) parts.push(hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : `${hours} ساعات`);
  if (minutes > 0) parts.push(minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتين' : `${minutes} دقيقة`);
  if (parts.length === 0) return '0 دقيقة';
  return parts.join(' و');
}

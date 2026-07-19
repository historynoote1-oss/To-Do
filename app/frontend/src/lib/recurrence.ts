export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const FREQUENCY_OPTIONS: { key: RecurrenceFrequency; label: string; unit: string }[] = [
  { key: 'DAILY', label: 'يوميًا', unit: 'يوم' },
  { key: 'WEEKLY', label: 'أسبوعيًا', unit: 'أسبوع' },
  { key: 'MONTHLY', label: 'شهريًا', unit: 'شهر' },
  { key: 'YEARLY', label: 'سنويًا', unit: 'سنة' },
];

export function frequencyLabel(key: RecurrenceFrequency): string {
  return FREQUENCY_OPTIONS.find((f) => f.key === key)?.label || key;
}

// وصف مختصر ومفهوم لدورة التكرار — "كل يوم" لو interval=1، أو "كل 3 أسابيع"
// لو interval أكبر من واحد، بصيغة عربية سليمة نحويًا في أشهر الحالات.
const DUAL_FORMS: Record<string, string> = { 'يوم': 'يومين', 'أسبوع': 'أسبوعين', 'شهر': 'شهرين', 'سنة': 'سنتين' };
const PLURAL_FORMS: Record<string, string> = { 'يوم': 'أيام', 'أسبوع': 'أسابيع', 'شهر': 'شهور', 'سنة': 'سنين' };

export function intervalDescription(key: RecurrenceFrequency, interval: number): string {
  const opt = FREQUENCY_OPTIONS.find((f) => f.key === key);
  if (!opt) return '';
  if (interval <= 1) return `كل ${opt.unit}`;
  if (interval === 2) return `كل ${DUAL_FORMS[opt.unit]}`;
  return `كل ${interval} ${PLURAL_FORMS[opt.unit]}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
}

import { createPasswordGate } from './createPasswordGate';

// حماية إضافية (step-up authentication) للإجراءات الخطيرة في لوحة الأدمن:
// حتى لو حد قدر يسرق التوكن بتاع الأدمن (من جهاز مسروق، تسريب، إلخ)،
// مش هيقدر ينفذ حذف/تعليق/إعادة تعيين باسورد من غير ما يكتب كلمة مرور
// الأدمن نفسه في كل مرة. التوكن وحده مش كافي للعمليات دي.
export const requireAdminPassword = createPasswordGate({
  bodyField: 'adminPassword',
  missingPasswordError: 'لازم تأكد بكلمة مرورك عشان تنفذ الإجراء ده',
  wrongPasswordError: 'كلمة المرور غلط، الإجراء اتلغى',
});

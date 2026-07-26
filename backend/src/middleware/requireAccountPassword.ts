import { createPasswordGate } from './createPasswordGate';

// حماية إضافية (step-up authentication) لأي إجراء تدميري نهائي مينفعش
// يترجع على مستوى المستخدم العادي نفسه — زي حذف هدف بكل تبعياته من خريطة
// الأهداف. نفس فلسفة requireAdminPassword بالظبط بس بتتحقق من كلمة مرور
// المستخدم الحالي نفسه (مش شرط يكون أدمن).
export const requireAccountPassword = createPasswordGate({
  bodyField: 'password',
  missingPasswordError: 'لازم تأكد بكلمة مرور حسابك عشان تنفذ الحذف ده',
  wrongPasswordError: 'كلمة المرور غلط، عملية الحذف اتلغت',
});

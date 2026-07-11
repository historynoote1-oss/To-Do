// ============================================================================
// إرسال الإيميلات عبر Resend (https://resend.com) — API بسيط عبر fetch عادي
// من غير أي مكتبة SMTP ثقيلة، وده مناسب لبيئات زي Railway/Vercel.
//
// الإعداد المطلوب في متغيرات البيئة (.env):
//   RESEND_API_KEY  -> مفتاح API بتاعك من لوحة Resend
//   EMAIL_FROM      -> عنوان المرسل، مثال: "قائمة المهام <noreply@yourdomain.com>"
//                      (لازم يكون على دومين متأكد منه (verified) في Resend)
//   FRONTEND_URL    -> نفس المتغير المستخدم أصلاً في CORS، بنستخدمه لبناء روابط
//                      التحقق واسترجاع كلمة المرور اللي بتتبعت في الإيميل
//
// لو RESEND_API_KEY مش موجود (مثلاً وانت لسه بتطوّر محليًا)، الدالة مش بتفشل —
// بتطبع محتوى الإيميل في الـ console بدل ما تبعته فعليًا، عشان تقدر تكمل شغل
// وتختبر التدفق كامل من غير ما تكون مضطر تربط خدمة إيميل فورًا.
// ============================================================================

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY مش متظبط — الإيميل ده مش هيتبعت فعليًا، وده محتواه للمراجعة فقط:\n` +
        `  إلى: ${to}\n  الموضوع: ${subject}\n  الرابط/المحتوى: ${html.replace(/<[^>]+>/g, ' ').trim().slice(0, 300)}`
    );
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] فشل إرسال إيميل إلى ${to}: ${res.status} ${body}`);
    // بنكسر بهدوء من غير ما نرمي error يوقف طلب المستخدم بالكامل؛ منطق الـ
    // routes نفسه دايمًا بيرجّع رسالة عامة للمستخدم بغض النظر عن نجاح الإرسال،
    // عشان محدش يقدر يكتشف حسابات موجودة من فرق التوقيت أو الأخطاء.
  }
}

function wrapTemplate(title: string, bodyHtml: string): string {
  return `
  <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:#0f0d0a; padding:32px; color:#f1e9dd;">
    <div style="max-width:480px; margin:0 auto; background:#1a160f; border:1px solid #3a2f1f; border-radius:12px; padding:32px;">
      <h1 style="color:#e8b84b; font-size:20px; margin:0 0 16px;">${title}</h1>
      <div style="font-size:15px; line-height:1.8; color:#d8cdb8;">${bodyHtml}</div>
      <p style="margin-top:32px; font-size:12px; color:#7a6f5c;">لو الرسالة دي وصلتلك بالغلط، تجاهلها ببساطة — مفيش أي تغيير هيحصل في حسابك.</p>
    </div>
  </div>`;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const html = wrapTemplate(
    'طلب إعادة تعيين كلمة المرور',
    `<p>وصلنا طلب لإعادة تعيين كلمة المرور بتاعة حسابك.</p>
     <p><a href="${resetUrl}" style="display:inline-block; background:#e8b84b; color:#1a160f; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">إعادة تعيين كلمة المرور</a></p>
     <p>الرابط ده صالح لمدة 30 دقيقة بس. لو محدش من عندك طلب الخطوة دي، تجاهل الإيميل ده وكلمة مرورك هتفضل زي ما هي.</p>`
  );
  await sendEmail({ to, subject: 'إعادة تعيين كلمة المرور — قائمة المهام', html });
}

export async function sendEmailVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const html = wrapTemplate(
    'تأكيد بريدك الإلكتروني',
    `<p>خطوة أخيرة عشان تفعّل استرجاع كلمة المرور بالإيميل على حسابك.</p>
     <p><a href="${verifyUrl}" style="display:inline-block; background:#e8b84b; color:#1a160f; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">تأكيد الإيميل</a></p>
     <p>الرابط ده صالح لمدة 24 ساعة.</p>`
  );
  await sendEmail({ to, subject: 'تأكيد بريدك الإلكتروني — قائمة المهام', html });
}

export async function sendRehabilitationCompletedEmail(to: string, username: string): Promise<void> {
  const html = wrapTemplate(
    'تم تأمين حسابك بنجاح ✅',
    `<p>أهلًا ${username}،</p>
     <p>تم نقل حسابك بنجاح للنظام الجديد الأكثر أمانًا، وربطه بالإيميل ده. كل قوائمك ومهامك القديمة موجودة بالكامل زي ما هي.</p>
     <p>لو الخطوة دي متعملتش من عندك، تواصل مع إدارة الموقع فورًا.</p>`
  );
  await sendEmail({ to, subject: 'تم تأمين حسابك — قائمة المهام', html });
}

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

// ============================================================================
// تخزين صور الأفتار
// ----------------------------------------------------------------------------
// لو حطيت متغيرات البيئة CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY +
// CLOUDINARY_API_SECRET (حساب Cloudinary مجاني)، الصور هتترفع هناك تلقائيًا
// وتفضل موجودة دايمًا حتى لو السيرفر اتعمله إعادة نشر (نظام الملفات المحلي
// بيتصفّر مع كل نشر جديد على استضافات زي Railway).
//
// لو مفيش متغيرات Cloudinary متظبطة، النظام هيرجع تلقائيًا للتخزين المحلي
// القديم (على القرص) عشان الموقع يفضل شغال زي ما هو من غير أي كسر.
// ============================================================================

// .trim() هنا مهم جدًا: لو المتغيرات دي اتنسخت ولصقت من مكان تاني (زي
// إيميل أو مستند) غالبًا بتيجي معاها مسافة أو سطر جديد مخفي في الآخر،
// وده بيخلي التوقيع (signature) يبقى غلط دايمًا حتى لو الاسم/المفتاح/السر
// نفسهم صح 100%. الخطأ اللي بيظهر وقتها هو "Invalid Signature" من Cloudinary.
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();

export const CLOUDINARY_ENABLED = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
);

if (CLOUDINARY_ENABLED) {
  // لوج بسيط وقت تشغيل السيرفر يفيد في التشخيص من على Railway logs من
  // غير ما نطبع السر نفسه. لو الاسم اللي ظاهر هنا مش مطابق لما هو موجود
  // في Cloudinary Dashboard، يبقى المتغير مظبوط غلط في إعدادات الاستضافة.
  console.log(`[avatarUpload] تخزين الأفتار شغال على Cloudinary (cloud: ${CLOUDINARY_CLOUD_NAME})`);
} else {
  console.log('[avatarUpload] تخزين الأفتار شغال محليًا (Cloudinary مش مفعّل)');
}

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 ميجابايت

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
    cb(new Error('نوع الصورة لازم يكون JPG أو PNG أو WEBP أو GIF'));
    return;
  }
  cb(null, true);
}

// ---- الوضع القديم: تخزين على القرص المحلي ----
export const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
if (!CLOUDINARY_ENABLED) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req: any, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || path.extname(file.originalname) || '.jpg';
    const uniqueName = `${req.userId}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

// ---- الوضع الجديد: تخزين مؤقت في الذاكرة عشان نرفعه بعدين على Cloudinary ----
const memoryStorage = multer.memoryStorage();

// middleware جاهز يتحط على أي route محتاج يستقبل ملف واحد باسم الحقل "avatar"
export const avatarUpload = multer({
  storage: CLOUDINARY_ENABLED ? memoryStorage : diskStorage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_BYTES },
}).single('avatar');

function cloudinarySign(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(toSign + CLOUDINARY_API_SECRET)
    .digest('hex');
}

// كل مستخدم ليه public_id ثابت في Cloudinary (avatars/<userId>)، فلما يرفع
// صورة جديدة بنستخدم overwrite:true فبتستبدل القديمة تلقائيًا من غير ما
// نحتاج نمسحها يدويًا، وده بيبسّط عملية الحذف والاستبدال كتير.
function cloudinaryPublicId(userId: string) {
  return `avatars/${userId}`;
}

export async function uploadAvatarToCloudinary(
  buffer: Buffer,
  mimetype: string,
  userId: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = cloudinaryPublicId(userId);
  const signature = cloudinarySign({
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp,
  });

  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(buffer)], { type: mimetype }));
  form.append('api_key', CLOUDINARY_API_KEY!);
  form.append('timestamp', String(timestamp));
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('invalidate', 'true');
  form.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );
  const data: any = await res.json();
  if (!res.ok) {
    // بنطبع تفاصيل الخطأ الكاملة (زي رسالة "Invalid Signature" وتفاصيلها)
    // في لوجات السيرفر بس، عشان المطوّر يقدر يشخّص المشكلة (غالبًا يبقى
    // متغيرات Cloudinary مش مظبوطة صح في إعدادات الاستضافة). المستخدم
    // العادي بياخد رسالة عربي بسيطة بدل ما تتعرض له تفاصيل تقنية داخلية.
    console.error('[avatarUpload] فشل الرفع على Cloudinary:', data?.error || data);
    throw new Error('تعذّر رفع الصورة دلوقتي، جرّب تاني كمان شوية 🙏');
  }
  return data.secure_url as string;
}

export async function deleteAvatarFromCloudinary(userId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = cloudinaryPublicId(userId);
  const signature = cloudinarySign({ public_id: publicId, timestamp });

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('api_key', CLOUDINARY_API_KEY!);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: 'POST',
      body: form,
    });
  } catch (err) {
    // لو المسح فشل لأي سبب، مش هنوقف عملية حذف/تحديث الأفتار الأساسية
    // بسببه — بس بنسجّل الخطأ في اللوجات عشان التشخيص لو تكرر.
    console.error('[avatarUpload] فشل حذف الصورة القديمة من Cloudinary:', err);
  }
}

// بنمسح ملف الأفتار القديم من على القرص لما المستخدم يرفع صورة جديدة أو
// يشيل صورته (الوضع المحلي بس — في وضع Cloudinary الاستبدال/الحذف
// بيحصل بدالة deleteAvatarFromCloudinary بالـ public_id مباشرة).
export function deleteAvatarFile(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return;
  if (/^https?:\/\//.test(avatarUrl)) return; // ملف على Cloudinary مش على القرص المحلي
  const filename = path.basename(avatarUrl);
  const filePath = path.join(AVATAR_DIR, filename);
  fs.unlink(filePath, () => {
    // لو الملف مش موجود أصلًا أو حصل خطأ في المسح، مفيش داعي نوقف العملية
    // الأساسية (تحديث/حذف الأفتار) بسبب كده.
  });
}

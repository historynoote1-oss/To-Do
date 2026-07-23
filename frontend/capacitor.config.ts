import type { CapacitorConfig } from '@capacitor/cli';

// فيه طريقتان لتشغيل التطبيق — اقرأ الدليل (القسم 3) قبل ما تختار:
//
// (أ) "Live URL" — التطبيق بيفتح موقعك المنشور مباشرة. أي تعديل تنزله على
//     الموقع (Vercel) بيظهر للمستخدمين فورًا من غير ما تعمل APK جديد.
//     ده الوضع الافتراضي هنا، وهو المناسب لحالتك (عايز تحديثات عالطول).
//
// (ب) "Bundled" — بيغلّف ملفات dist/ جوه التطبيق نفسه (يشتغل حتى من غير
//     نت لواجهة الاستخدام، لكن أي تعديل في الواجهة محتاج build APK جديد
//     وتوزيعه من الأول). لو عايز الوضع ده، امسح كتلة server بالكامل.

const config: CapacitorConfig = {
  appId: 'com.kharita.mobile',
  appName: 'خريطة',
  webDir: 'dist',
  server: {
    // ⚠️ غيّر الرابط ده لرابط موقعك الفعلي بعد ما تنشره على Vercel
    url: 'https://kharita.vercel.app/',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

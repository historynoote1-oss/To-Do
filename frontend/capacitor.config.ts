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
  plugins: {
    // بيتحكم في شاشة البداية *قبل* ما JS يشتغل خالص (لحظة فتح التطبيق).
    // launchAutoHide: false عشان إحنا اللي بنقفلها يدويًا من nativeShell.ts
    // (hideSplash) بعد ما أول شاشة فعلية تجهز — لو سبناها true هتختفي
    // فورًا وتوري وميض أبيض قبل المحتوى.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#f1eee5',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#f1eee5',
    },
  },
};

export default config;

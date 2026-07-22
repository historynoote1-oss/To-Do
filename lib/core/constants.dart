/// إعدادات عامة للتطبيق.
///
/// عدّل [apiBaseUrl] هنا ليطابق رابط الباك إند بتاعك على Railway
/// (نفس اللي مكتوب في frontend/.env كـ VITE_API_URL في مشروع الموقع).
/// مفيش أي تغيير مطلوب على السيرفر أو قاعدة البيانات — التطبيق بيكلّم
/// نفس الـ API اللي الموقع بيكلّمه بالظبط.
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://your-backend.up.railway.app',
  );

  static const String appName = 'قائمة المهام';
}

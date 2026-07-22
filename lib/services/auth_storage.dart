import 'package:shared_preferences/shared_preferences.dart';

/// حفظ/قراءة/مسح جلسة المستخدم محليًا على الجهاز (SharedPreferences).
/// نفس فكرة localStorage في الموقع، بس بتخزين أصلي على مستوى النظام.
class AuthStorage {
  AuthStorage._();

  static const _keyToken = 'auth_token';
  static const _keyUsername = 'auth_username';
  static const _keyIsAdmin = 'auth_is_admin';

  static Future<void> saveSession({
    required String token,
    required String username,
    required bool isAdmin,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, token);
    await prefs.setString(_keyUsername, username);
    await prefs.setBool(_keyIsAdmin, isAdmin);
  }

  static Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyToken);
  }

  static Future<String?> readUsername() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyUsername);
  }

  static Future<bool> readIsAdmin() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_keyIsAdmin) ?? false;
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyUsername);
    await prefs.remove(_keyIsAdmin);
  }
}

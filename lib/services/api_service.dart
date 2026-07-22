import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants.dart';

/// نتيجة موحّدة لأي عملية مصادقة (تسجيل دخول / إنشاء حساب).
class AuthResult {
  final bool success;
  final String? token;
  final String? username;
  final bool isAdmin;
  final String? errorMessage;
  final String? recoveryCode;

  /// حالات خاصة بيرجعها الباك إند ولسه التطبيق مبيعالجهاش بواجهة كاملة
  /// (حساب قديم محتاج إعادة تأهيل، أو أدمن مفعّل عليه 2FA). بنوضّحها
  /// للمستخدم برسالة بدل ما نفشل بصمت.
  final String? specialCase;

  const AuthResult._({
    required this.success,
    this.token,
    this.username,
    this.isAdmin = false,
    this.errorMessage,
    this.recoveryCode,
    this.specialCase,
  });

  factory AuthResult.success({
    required String token,
    required String username,
    required bool isAdmin,
    String? recoveryCode,
  }) {
    return AuthResult._(
      success: true,
      token: token,
      username: username,
      isAdmin: isAdmin,
      recoveryCode: recoveryCode,
    );
  }

  factory AuthResult.failure(String message) {
    return AuthResult._(success: false, errorMessage: message);
  }

  factory AuthResult.special(String message) {
    return AuthResult._(success: false, specialCase: message, errorMessage: message);
  }
}

class ApiService {
  ApiService._();

  static final Uri _registerUrl = Uri.parse('${AppConfig.apiBaseUrl}/api/auth/register');
  static final Uri _loginUrl = Uri.parse('${AppConfig.apiBaseUrl}/api/auth/login');

  static const _timeout = Duration(seconds: 15);

  static Future<AuthResult> register({
    required String username,
    required String password,
  }) async {
    try {
      final response = await http
          .post(
            _registerUrl,
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'username': username, 'password': password}),
          )
          .timeout(_timeout);

      final data = _safeDecode(response.body);

      if (response.statusCode == 200 && data['token'] != null) {
        return AuthResult.success(
          token: data['token'] as String,
          username: data['username'] as String? ?? username,
          isAdmin: data['isAdmin'] == true,
          recoveryCode: data['recoveryCode'] as String?,
        );
      }

      return AuthResult.failure(_extractError(data, response.statusCode));
    } on http.ClientException {
      return AuthResult.failure('تعذّر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول تاني');
    } catch (_) {
      return AuthResult.failure('حصل خطأ غير متوقع، حاول تاني');
    }
  }

  static Future<AuthResult> login({
    required String username,
    required String password,
  }) async {
    try {
      final response = await http
          .post(
            _loginUrl,
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'username': username, 'password': password}),
          )
          .timeout(_timeout);

      final data = _safeDecode(response.body);

      if (response.statusCode == 200 && data['token'] != null) {
        return AuthResult.success(
          token: data['token'] as String,
          username: data['username'] as String? ?? username,
          isAdmin: data['isAdmin'] == true,
        );
      }

      if (data['requiresTwoFactor'] == true) {
        return AuthResult.special(
          'الحساب ده مفعّل عليه تحقق بخطوتين، ده لسه مش مدعوم في التطبيق — سجل دخول من الموقع مؤقتًا',
        );
      }

      if (data['requiresRehabilitation'] == true) {
        return AuthResult.special(
          'الحساب ده محتاج تحديث أمان قبل الدخول (خطوة تحصل مرة واحدة فقط) — سجل دخول من الموقع لإتمامها',
        );
      }

      return AuthResult.failure(_extractError(data, response.statusCode));
    } on http.ClientException {
      return AuthResult.failure('تعذّر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت وحاول تاني');
    } catch (_) {
      return AuthResult.failure('حصل خطأ غير متوقع، حاول تاني');
    }
  }

  static Map<String, dynamic> _safeDecode(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {};
    } catch (_) {
      return {};
    }
  }

  static String _extractError(Map<String, dynamic> data, int statusCode) {
    if (data['error'] is String) return data['error'] as String;
    if (statusCode == 0) return 'تعذّر الاتصال بالسيرفر';
    return 'حصل خطأ (كود $statusCode)، حاول تاني';
  }
}

import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../services/auth_storage.dart';
import '../widgets/auth_background.dart';
import 'login_screen.dart';

/// شاشة مؤقتة بعد نجاح تسجيل الدخول/إنشاء الحساب — باقي شاشات التطبيق
/// (المهام، خريطة الأهداف، البومودورو...) هتتبني تباعًا فوق نفس الأساس ده.
class HomePlaceholderScreen extends StatelessWidget {
  const HomePlaceholderScreen({super.key, required this.username});

  final String username;

  Future<void> _logout(BuildContext context) async {
    await AuthStorage.clear();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AuthBackground(
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 78,
                    height: 78,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: AppColors.brandGradient,
                    ),
                    child: const Icon(Icons.check_rounded, color: Colors.white, size: 38),
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'أهلاً بيك، $username',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'تم تسجيل الدخول بنجاح. باقي شاشات التطبيق (المهام،\n'
                    'خريطة الأهداف، البومودورو) جايين في الخطوة اللي بعد كده.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textMuted, fontSize: 14, height: 1.6),
                  ),
                  const SizedBox(height: 32),
                  OutlinedButton(
                    onPressed: () => _logout(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textPrimary,
                      side: const BorderSide(color: AppColors.border),
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('تسجيل الخروج'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

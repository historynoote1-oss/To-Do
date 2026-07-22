import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../services/auth_storage.dart';
import '../widgets/auth_background.dart';
import 'home_placeholder_screen.dart';
import 'login_screen.dart';

/// أول شاشة بتفتح — بتتأكد لو فيه جلسة محفوظة على الجهاز، ولو موجودة
/// بتدخل المستخدم على طول من غير ما يسجل دخول تاني.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    final token = await AuthStorage.readToken();
    final username = await AuthStorage.readUsername();

    if (!mounted) return;

    if (token != null && username != null) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => HomePlaceholderScreen(username: username)),
      );
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AuthBackground(
        child: Center(
          child: Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: AppColors.brandGradient,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Image.asset('assets/images/app_icon.png', fit: BoxFit.cover),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';

/// خلفية غامقة متدرّجة مع "توهّجات" لونية بهوية العلامة — بديل حديث
/// للخلفية المسطحة، بيدي إحساس تطبيق أصلي مش صفحة ويب.
class AuthBackground extends StatelessWidget {
  const AuthBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Container(
          decoration: const BoxDecoration(gradient: AppColors.backgroundGradient),
        ),
        Positioned(
          top: -120,
          right: -80,
          child: _glow(AppColors.teal.withOpacity(0.35), 260),
        ),
        Positioned(
          bottom: -100,
          left: -100,
          child: _glow(AppColors.gold.withOpacity(0.18), 280),
        ),
        Positioned(
          top: 220,
          left: -60,
          child: _glow(AppColors.green.withOpacity(0.16), 200),
        ),
        child,
      ],
    );
  }

  Widget _glow(Color color, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, color.withOpacity(0)]),
      ),
    );
  }
}

import 'package:flutter/material.dart';

/// هوية بصرية جديدة للتطبيق — مبنية على نفس ألوان العلامة التجارية
/// (تركواز/أخضر/ذهبي) لكن بهيكلة "تطبيق أصلي" غامقة، مش نسخة من الموقع.
class AppColors {
  AppColors._();

  static const Color teal = Color(0xFF1D6F73);
  static const Color tealDeep = Color(0xFF0F4649);
  static const Color green = Color(0xFF2E8B57);
  static const Color gold = Color(0xFFD99A2B);
  static const Color danger = Color(0xFFE5645A);

  static const Color bgTop = Color(0xFF0B1614);
  static const Color bgBottom = Color(0xFF0F2422);
  static const Color surface = Color(0xFF15201F);
  static const Color surfaceElevated = Color(0xFF1B2B29);
  static const Color border = Color(0x1FFFFFFF);

  static const Color textPrimary = Color(0xFFF3F1E9);
  static const Color textMuted = Color(0xFFA7B0AC);
  static const Color textFaint = Color(0xFF6D7A76);

  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [teal, green, gold],
  );

  static const LinearGradient backgroundGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [bgTop, bgBottom],
  );
}

class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bgBottom,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.teal,
        secondary: AppColors.gold,
        surface: AppColors.surface,
        error: AppColors.danger,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceElevated,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.teal, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.6),
        ),
        labelStyle: const TextStyle(color: AppColors.textMuted),
        hintStyle: const TextStyle(color: AppColors.textFaint),
      ),
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: AppColors.gold,
        selectionColor: Color(0x551D6F73),
        selectionHandleColor: AppColors.teal,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surfaceElevated,
        contentTextStyle: const TextStyle(color: AppColors.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        behavior: SnackBarBehavior.floating,
      ),
      dividerColor: AppColors.border,
    );
  }
}

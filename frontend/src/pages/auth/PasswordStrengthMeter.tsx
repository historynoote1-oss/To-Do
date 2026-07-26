import { PasswordStrength } from '@/utils/passwordStrength';

// شريط قوة كلمة المرور، كان الـ JSX بتاعه متكرر حرفيًا في AuthForm
// وForgotPasswordForm وRehabilitationForm.
export default function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  return (
    <div className={`password-strength strength-${strength.score}`}>
      <span className="password-strength-bar">
        <span />
        <span />
        <span />
      </span>
      <span className="password-strength-label">{strength.label}</span>
    </div>
  );
}

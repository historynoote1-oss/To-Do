import { DynamicIcon } from '../lib/icons';

// زرار رجوع موحّد لكل هيدرات الصفحات — بديل زرار النص العادي القديم.
// دائرة أيقونة بسهم متحرك بيتحرك خطوة لما تعمل hover/focus، مع تسمية
// واضحة جنبه، عشان التنقل بين الصفحات يبان أسرع وأفخم من غير ما يفقد
// وضوحه أو سهولة الوصول له باللمس على الموبايل.
export default function BackButton({
  onClick,
  label = 'رجوع',
  className = '',
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button className={`back-button ${className}`.trim()} onClick={onClick} type="button" aria-label={label}>
      <span className="back-button-icon">
        <DynamicIcon name="arrow-right" size={16} />
      </span>
      <span className="back-button-label">{label}</span>
    </button>
  );
}

import { DynamicIcon } from '@/lib/core/icons';

// زرار رجوع موحّد لكل هيدرات الصفحات — أيقونة فقط من غير نص، بتصميم
// دائري مضغوط بياخد مساحة أقل في الهيدر لكنه بيحافظ على مساحة لمس
// مريحة. الاسم بيتحط كـ aria-label للقارئ الصوتي بس، مش ظاهر بصريًا.
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
    <button className={`back-button ${className}`.trim()} onClick={onClick} type="button" aria-label={label} title={label}>
      <DynamicIcon name="arrow-right" size={20} strokeWidth={2.25} />
    </button>
  );
}

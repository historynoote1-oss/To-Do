import { LIFE_AREA_ICON_GROUPS } from '@/utils/lifeArea';
import { DynamicIcon } from '@/utils/icons';

// ===== مكوّنات مشتركة بين شاشات مجالات الحياة (المدير الكامل، الإنشاء
// السريع، وويزارد الإنشاء خطوة-بخطوة) — اتنقلت هنا في ملف مستقل عشان أي
// حد فيهم يقدر يستوردها من غير استيراد دائري (Circular Import) مع
// LifeAreasManager.tsx. =====

// شارة معاينة (Avatar) موحّدة لمجال الحياة — لو فيه صورة بتتعرض هي، ولو
// أيقونة بس بتتحط جوه دائرة بخلفية بلون المجال الصافي.
export function AreaAvatar({
  color,
  icon,
  imageUrl,
  size = 44,
  iconSize = 20,
}: {
  color: string;
  icon: string | null | undefined;
  imageUrl?: string | null;
  size?: number;
  iconSize?: number;
}) {
  if (imageUrl) {
    return (
      <span
        className="life-area-avatar life-area-avatar-img"
        style={{ width: size, height: size, borderRadius: size / 3.2 }}
      >
        <img src={imageUrl} alt="" />
      </span>
    );
  }
  return (
    <span
      className="life-area-avatar"
      style={{ width: size, height: size, borderRadius: size / 3.2, background: color }}
    >
      <DynamicIcon name={icon || 'tag'} size={iconSize} className="life-area-avatar-icon" />
    </span>
  );
}

// شبكة الأيقونات — مقسّمة لأقسام عشان تتعرض كـ"اقتراحات" مبوّبة حسب جانب
// الحياة بدل قائمة طويلة عشوائية.
export function IconGroups({ value, onSelect }: { value: string; onSelect: (icon: string) => void }) {
  return (
    <div className="life-area-icon-groups">
      {LIFE_AREA_ICON_GROUPS.map((group) => (
        <div key={group.label} className="life-area-icon-group">
          <span className="life-area-group-label">{group.label}</span>
          <div className="life-area-icon-grid">
            {group.icons.map((icon) => (
              <button
                key={icon}
                type="button"
                className={`life-area-icon-choice ${value === icon ? 'selected' : ''}`}
                onClick={() => onSelect(icon)}
                aria-label={`اختيار الأيقونة ${icon}`}
                title={icon}
              >
                <DynamicIcon name={icon} size={18} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

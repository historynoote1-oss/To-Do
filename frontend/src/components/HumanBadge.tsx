export default function HumanBadge({ authorName }: { authorName: string }) {
  return (
    <span className="human-badge" title="التحديث ده مكتوب بواسطة إنسان حقيقي من فريقنا، مش ذكاء اصطناعي">
      ✍️ بقلم {authorName} — <strong>تحديث بشري 100%</strong>
    </span>
  );
}

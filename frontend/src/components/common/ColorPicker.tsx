import { useCallback, useEffect, useRef, useState } from 'react';

// ===== منتقي ألوان احترافي (بديل شبكة الألوان الجاهزة القديمة) =====
// مربّع تشبّع/سطوع (Saturation × Value) + شريط تدرّج لوني (Hue) + إدخال
// HEX مباشر + معاينة حية. مبني بالكامل بـ pointer events خفيفة، من غير
// أي مكتبة خارجية، وبيشتغل بالماوس واللمس على حد سواء (touch-action: none
// على مناطق السحب عشان يمنع السكرول أثناء السحب على الموبايل).

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex.trim());
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // الحالة الداخلية (h, s, v) منفصلة عن الـ hex النهائي عشان نقدر نحافظ
  // على hue وsaturation وقت v=0 أو s=0 (لما تتحوّل للأسود/الرمادي بيضيع
  // الـ hue لو اعتمدنا على تحويل hex→hsv في كل render).
  const [hsv, setHsv] = useState<[number, number, number]>(() => {
    const rgb = hexToRgb(value) || [124, 58, 237];
    return rgbToHsv(...rgb);
  });
  const [hexInput, setHexInput] = useState(value);

  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<'sv' | 'hue' | null>(null);

  // لو اتغيّر اللون من برّه (مثلاً فتح تعديل مجال تاني) نزامن الحالة
  // الداخلية، لكن من غير ما نكسر السحب الجاري.
  useEffect(() => {
    if (draggingRef.current) return;
    const rgb = hexToRgb(value);
    if (!rgb) return;
    setHsv(rgbToHsv(...rgb));
    setHexInput(value);
  }, [value]);

  const commit = useCallback(
    (h: number, s: number, v: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      const hex = rgbToHex(r, g, b);
      setHexInput(hex);
      onChange(hex);
    },
    [onChange]
  );

  const updateFromSvPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = clamp01((clientX - rect.left) / rect.width);
      const v = clamp01(1 - (clientY - rect.top) / rect.height);
      setHsv(([h]) => {
        commit(h, s, v);
        return [h, s, v];
      });
    },
    [commit]
  );

  const updateFromHuePointer = useCallback(
    (clientX: number) => {
      const rect = hueRef.current?.getBoundingClientRect();
      if (!rect) return;
      const h = clamp01((clientX - rect.left) / rect.width) * 360;
      setHsv(([, s, v]) => {
        commit(h, s, v);
        return [h, s, v];
      });
    },
    [commit]
  );

  function handleSvPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = 'sv';
    updateFromSvPointer(e.clientX, e.clientY);
  }
  function handleHuePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = 'hue';
    updateFromHuePointer(e.clientX);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (draggingRef.current === 'sv') updateFromSvPointer(e.clientX, e.clientY);
    else if (draggingRef.current === 'hue') updateFromHuePointer(e.clientX);
  }
  function handlePointerUp(e: React.PointerEvent) {
    draggingRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* لا شيء — ممكن يكون اتسحب فعلاً */
    }
  }

  function handleHexChange(raw: string) {
    let next = raw.trim();
    if (next && !next.startsWith('#')) next = `#${next}`;
    setHexInput(next);
    if (isValidHex(next)) {
      const rgb = hexToRgb(next)!;
      setHsv(rgbToHsv(...rgb));
      onChange(next.toLowerCase());
    }
  }

  function handleHexBlur() {
    // لو المستخدم سايب قيمة ناقصة/غلط، بنرجّعها لآخر لون صحيح بدل ما
    // نسيبها معلّقة.
    if (!isValidHex(hexInput)) setHexInput(value);
  }

  const [h, s, v] = hsv;
  const pureHueHex = rgbToHex(...hsvToRgb(h, 1, 1));

  return (
    <div className="color-picker">
      <div
        ref={svRef}
        className="color-picker-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHueHex})` }}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="التشبّع والسطوع"
        aria-valuetext={`s:${Math.round(s * 100)}% v:${Math.round(v * 100)}%`}
        tabIndex={0}
      >
        <div
          className="color-picker-sv-thumb"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: value }}
        />
      </div>

      <div
        ref={hueRef}
        className="color-picker-hue"
        onPointerDown={handleHuePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="درجة اللون (Hue)"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        tabIndex={0}
      >
        <div className="color-picker-hue-thumb" style={{ left: `${(h / 360) * 100}%`, background: pureHueHex }} />
      </div>

      <div className="color-picker-footer">
        <span className="color-picker-preview" style={{ background: value }} aria-hidden="true" />
        <div className="color-picker-hex-field">
          <span>#</span>
          <input
            className="color-picker-hex-input"
            value={hexInput.replace(/^#/, '')}
            onChange={(e) => handleHexChange(e.target.value)}
            onBlur={handleHexBlur}
            maxLength={6}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="كود اللون HEX"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}

export default ColorPicker;

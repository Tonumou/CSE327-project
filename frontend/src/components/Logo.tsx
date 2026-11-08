// The logo is drawn like a real parking sign: blue plate, white inner border, bold P
export default function Logo({ size = 40, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md p-[3px] ${inverted ? "bg-white" : "bg-brand-600"}`}
      style={{ width: size, height: size }}
    >
      <span
        className={`flex size-full items-center justify-center rounded-[3px] border-2 font-[family-name:var(--font-display)] leading-none font-extrabold ${
          inverted ? "border-brand-700 text-brand-700" : "border-white text-white"
        }`}
        style={{ fontSize: size * 0.55 }}
      >
        P
      </span>
    </span>
  );
}

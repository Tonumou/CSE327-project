// A car seen from above, drawn by hand in SVG. It faces to the RIGHT;
// rotate the wrapper to point it another way (-90 = facing up).
// lights = headlight beams + bright tail lights (used while driving).

export const CAR_COLORS = ["#e7e5e4", "#292524", "#b91c1c", "#1d4ed8", "#a8a29e", "#14532d", "#ca8a04", "#f5f5f4"];

export function carColor(seed: number) {
  return CAR_COLORS[Math.abs(seed * 7 + 3) % CAR_COLORS.length];
}

export default function Car({ color = CAR_COLORS[0], lights = false, braking = false }: { color?: string; lights?: boolean; braking?: boolean }) {
  // light paint needs a darker outline to stand out on grey asphalt
  const light = ["#e7e5e4", "#f5f5f4", "#a8a29e"].includes(color);
  return (
    <svg width="50" height="26" viewBox="-25 -13 50 26" overflow="visible" aria-hidden="true">
      {lights && (
        <g opacity="0.55">
          <polygon points="23,-9 70,-22 70,-3" fill="url(#beam)" />
          <polygon points="23,9 70,3 70,22" fill="url(#beam)" />
        </g>
      )}
      <defs>
        <linearGradient id="beam" x1="0" x2="1">
          <stop offset="0" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fef08a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* shadow under the car */}
      <rect x="-22" y="-10" width="46" height="24" rx="7" fill="#000" opacity="0.28" />
      {/* body */}
      <rect x="-23" y="-12" width="46" height="24" rx="7" fill={color} stroke={light ? "#78716c" : "none"} strokeWidth="0.8" />
      {/* bonnet crease and boot line */}
      <path d="M9 -8 Q15 0 9 8" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="1" />
      <path d="M-17 -8 Q-20 0 -17 8" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="1" />
      {/* roof, slightly darker */}
      <rect x="-11" y="-9.5" width="17" height="19" rx="3.5" fill="#000" opacity="0.12" />
      {/* windscreen (front) and rear window */}
      <path d="M6 -9 L11 -7.5 L11 7.5 L6 9 Z" fill="#1e293b" opacity="0.88" />
      <path d="M-11 -8.5 L-15 -7 L-15 7 L-11 8.5 Z" fill="#1e293b" opacity="0.8" />
      {/* side windows */}
      <rect x="-9" y="-11" width="14" height="1.6" rx="0.8" fill="#1e293b" opacity="0.6" />
      <rect x="-9" y="9.4" width="14" height="1.6" rx="0.8" fill="#1e293b" opacity="0.6" />
      {/* mirrors */}
      <rect x="4" y="-14.5" width="4" height="2.6" rx="1" fill={color} stroke={light ? "#78716c" : "none"} strokeWidth="0.6" />
      <rect x="4" y="11.9" width="4" height="2.6" rx="1" fill={color} stroke={light ? "#78716c" : "none"} strokeWidth="0.6" />
      {/* headlights */}
      <rect x="20.5" y="-9.5" width="2.5" height="4" rx="1" fill={lights ? "#fef9c3" : "#e7e5e4"} />
      <rect x="20.5" y="5.5" width="2.5" height="4" rx="1" fill={lights ? "#fef9c3" : "#e7e5e4"} />
      {/* tail lights */}
      <rect x="-23" y="-9.5" width="2.2" height="4" rx="1" fill="#ef4444" opacity={braking ? 1 : lights ? 0.8 : 0.45} />
      <rect x="-23" y="5.5" width="2.2" height="4" rx="1" fill="#ef4444" opacity={braking ? 1 : lights ? 0.8 : 0.45} />
      {braking && (
        <g opacity="0.5">
          <circle cx="-25" cy="-7.5" r="4" fill="#ef4444" />
          <circle cx="-25" cy="7.5" r="4" fill="#ef4444" />
        </g>
      )}
    </svg>
  );
}

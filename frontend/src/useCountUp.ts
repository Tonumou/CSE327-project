// Numbers glide to their new value instead of jumping (e.g. 3 -> 7 free slots)
import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, ms = 600) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    if (begin === target) return;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // fast start, soft landing
      const value = Math.round(begin + (target - begin) * eased);
      setShown(value);
      from.current = value;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return shown;
}

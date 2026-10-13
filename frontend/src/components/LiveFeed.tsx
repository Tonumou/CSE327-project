import { useEffect, useState } from "react";
import { frameUrl } from "../api";

// Shows the AI-annotated camera picture and refreshes it every second
export default function LiveFeed() {
  const [src, setSrc] = useState(frameUrl(true));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setSrc(frameUrl(true)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="font-semibold mb-3">Live Camera (AI view)</h2>
      {failed && (
        <p className="text-sm text-slate-500 mb-2">
          Waiting for the first frame from the AI... (is the backend running?)
        </p>
      )}
      <img
        src={src}
        alt="Live parking lot"
        className={`block mx-auto max-w-full max-h-[75vh] rounded-lg bg-slate-200 ${failed ? "hidden" : ""}`}
        onLoad={() => setFailed(false)}
        onError={() => setFailed(true)}
      />
      <p className="text-xs text-slate-500 mt-2">
        Green box = free slot, Red box = occupied slot, Orange box = vehicle detected by YOLO
      </p>
    </div>
  );
}

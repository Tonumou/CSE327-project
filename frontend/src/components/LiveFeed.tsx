import { useEffect, useRef, useState } from "react";
import { Camera, Download, Maximize2, Pause, Play, ScanEye } from "lucide-react";
import { frameUrl } from "../api";
import { usePrefs } from "../prefs";

const SPEEDS = [1, 2, 5]; // seconds between picture refreshes

// The camera picture from the backend, refreshed every few seconds
export default function LiveFeed() {
  const [annotated, setAnnotated] = useState(true); // AI view (boxes) or raw camera
  const [paused, setPaused] = useState(false);
  const { prefs } = usePrefs();
  const [speed, setSpeed] = useState(prefs.refreshSeconds); // default from Settings
  const [src, setSrc] = useState(frameUrl(true));
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSrc(frameUrl(annotated));
    if (paused) return;
    const timer = setInterval(() => setSrc(frameUrl(annotated)), speed * 1000);
    return () => clearInterval(timer);
  }, [annotated, paused, speed]);

  const fullscreen = () => boxRef.current?.requestFullscreen?.();

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <div className="mr-auto flex items-center gap-2">
          <h2 className="font-semibold">Live camera</h2>
          {!paused && !failed && (
            <span className="chip bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <span className="size-1.5 animate-pulse rounded-full bg-rose-500" /> LIVE
            </span>
          )}
          {paused && <span className="chip bg-stone-100 text-stone-500 dark:bg-stone-800">Paused</span>}
        </div>

        {/* AI view / raw camera switch */}
        <div className="flex rounded-xl bg-stone-100 p-1 text-xs font-semibold dark:bg-stone-800">
          {[
            { on: true, label: "Detections", icon: <ScanEye className="size-3.5" /> },
            { on: false, label: "Camera", icon: <Camera className="size-3.5" /> },
          ].map((v) => (
            <button
              key={v.label}
              onClick={() => setAnnotated(v.on)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition ${
                annotated === v.on ? "bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-white" : "text-stone-500"
              }`}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded-xl border-0 bg-stone-100 px-2 py-2 text-xs font-semibold dark:bg-stone-800"
          title="How often the picture refreshes"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              every {s}s
            </option>
          ))}
        </select>
        <button onClick={() => setPaused((p) => !p)} className="btn-ghost !p-2" title={paused ? "Resume" : "Pause"}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
        <a href={src} download="parking-snapshot.jpg" className="btn-ghost !p-2" title="Download this picture">
          <Download className="size-4" />
        </a>
        <button onClick={fullscreen} className="btn-ghost !p-2" title="Full screen">
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div ref={boxRef} className="flex items-center justify-center bg-stone-950">
        {failed && (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-stone-400">
            <Camera className="size-10 opacity-40" />
            <p className="text-sm">No camera picture yet</p>
            <p className="text-xs opacity-70">Start the backend, then choose a camera or upload a photo.</p>
          </div>
        )}
        <img
          src={src}
          alt="Live parking lot"
          className={`max-h-[70vh] w-auto max-w-full object-contain ${failed ? "hidden" : ""}`}
          onLoad={() => setFailed(false)}
          onError={() => setFailed(true)}
        />
      </div>

      <div className="flex flex-wrap gap-4 px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Free slot</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-400" /> Reserved</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-500" /> Occupied</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-orange-400" /> Vehicle seen by YOLO</span>
      </div>
    </div>
  );
}

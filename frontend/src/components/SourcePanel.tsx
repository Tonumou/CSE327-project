import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Link2, Loader2, UploadCloud, Video, Webcam } from "lucide-react";
import { setSource, uploadSource } from "../api";
import { useToast } from "../toast";

// Operator chooses what the AI watches: webcam, CCTV URL, or an uploaded photo / video
export default function SourcePanel({ current }: { current: string }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applySource = async (source: string) => {
    try {
      await setSource(source);
      toast("success", source === "0" ? "Switched to the webcam." : "Camera source changed.");
      setUrl("");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadSource(file);
      toast(
        r.error ? "info" : "success",
        r.error ? `Uploaded. ${r.error}` : `Found ${r.slots} parking spaces (${r.free} free) and ${r.cars} vehicles.`
      );
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    upload(e.dataTransfer.files[0]);
  };

  const label = current === "0" ? "Webcam" : current.startsWith("rtsp") || current.startsWith("http") ? "CCTV stream" : current.replace(/^uploads[\\/]/, "Uploaded ");

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Camera source</h2>
        <span className="chip max-w-[55%] truncate bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" title={current}>
          <Video className="size-3.5 shrink-0" /> <span className="truncate">{label || "-"}</span>
        </span>
      </div>

      {/* drag & drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "scale-[1.02] border-brand-500 bg-brand-50 dark:bg-brand-500/10"
            : "border-stone-300 hover:border-brand-400 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/50"
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-brand-600" />
            <p className="mt-2 text-sm font-medium">Analysing the picture...</p>
          </>
        ) : (
          <>
            <UploadCloud className={`size-8 transition ${dragging ? "text-brand-600" : "text-stone-400"}`} />
            <p className="mt-2 text-sm font-medium">
              Drop a photo or video here, or <span className="text-brand-600 dark:text-brand-400">browse</span>
            </p>
            <p className="text-xs text-stone-400">The AI finds the cars and parking spaces automatically</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = ""; // allow choosing the same file again
          }}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url.trim() && applySource(url.trim())}
            placeholder="rtsp://... CCTV address"
            className="input !py-2 pl-9"
          />
        </div>
        <button onClick={() => url.trim() && applySource(url.trim())} className="btn-ghost" disabled={!url.trim()}>
          Use
        </button>
      </div>
      <button onClick={() => applySource("0")} className="btn-ghost mt-2 w-full">
        <Webcam className="size-4" /> Use the webcam
      </button>
    </div>
  );
}

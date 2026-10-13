import { useState } from "react";
import { setSource, uploadSource } from "../api";

// Lets the operator choose what the AI watches: webcam, file, CCTV URL or an upload
export default function SourcePanel({ current }: { current: string }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  const apply = async () => {
    if (!text.trim()) return;
    try {
      await setSource(text.trim());
      setMessage("Camera source changed.");
      setText("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setMessage("Uploading and searching for parking spaces...");
    try {
      const r = await uploadSource(file);
      setMessage(
        r.error
          ? `"${file.name}" uploaded. ${r.error}`
          : `"${file.name}" uploaded - found ${r.slots} parking spaces (${r.free} free) and ${r.cars} vehicles.`
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <h2 className="font-semibold">Camera Source</h2>
      <p className="text-sm">
        Current: <span className="font-mono bg-slate-100 px-1 rounded">{current || "-"}</span>
      </p>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='0 = webcam, or rtsp://... camera URL'
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button onClick={apply} className="bg-blue-600 text-white px-4 rounded-lg text-sm">
          Use
        </button>
      </div>

      <p className="text-sm text-slate-500">Or upload a parking-lot photo / video:</p>
      <label className="block w-full text-center cursor-pointer bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg">
        Upload Photo / Video
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = ""; // allow choosing the same file again
          }}
          className="hidden"
        />
      </label>

      {message && <p className="text-sm text-blue-700">{message}</p>}
    </div>
  );
}

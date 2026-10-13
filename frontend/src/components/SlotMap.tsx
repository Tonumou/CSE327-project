import type { Slot } from "../types";

// Colour map of all slots: green = free, red = occupied
export default function SlotMap({ slots }: { slots: Slot[] }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="font-semibold mb-3">Slot Map</h2>
      {slots.length === 0 ? (
        <p className="text-sm text-slate-500">
          No slots yet. Open the "Slot Setup" page and draw slots on the camera picture.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((s) => (
            <div
              key={s.id}
              title={`Updated: ${s.updated_at}`}
              className={`rounded-lg p-3 text-center text-white font-semibold ${
                s.status === "free" ? "bg-green-500" : "bg-red-500"
              }`}
            >
              <div>{s.slot_code}</div>
              <div className="text-xs font-normal uppercase">{s.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

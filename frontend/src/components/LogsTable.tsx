import type { Log } from "../types";

// History of detections saved by the AI in the detection_logs table
export default function LogsTable({ logs }: { logs: Log[] }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 overflow-x-auto">
      <h2 className="font-semibold mb-3">Detection History</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b">
            <th className="py-2">Time</th>
            <th>Total</th>
            <th>Free</th>
            <th>Occupied</th>
            <th>Vehicles</th>
            <th>Outside slots</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-2">{l.created_at}</td>
              <td>{l.total_slots}</td>
              <td className="text-green-600 font-medium">{l.free_slots}</td>
              <td className="text-red-600 font-medium">{l.occupied_slots}</td>
              <td>{l.cars_detected}</td>
              <td className={l.cars_outside_slots > 0 ? "text-amber-600 font-medium" : ""}>
                {l.cars_outside_slots}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3 text-slate-500">No history yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

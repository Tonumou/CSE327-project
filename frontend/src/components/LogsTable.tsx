import type { Log } from "../types";

// Latest rows of the detection_logs table (one is saved every 10 seconds)
export default function LogsTable({ logs }: { logs: Log[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-stone-800">
        <h2 className="font-semibold">Detection log</h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">Newest first</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-50 text-left text-xs tracking-wide text-stone-500 uppercase dark:bg-stone-800/50 dark:text-stone-400">
              <th className="px-5 py-3 font-semibold">Time</th>
              <th className="px-3 py-3 font-semibold">Total</th>
              <th className="px-3 py-3 font-semibold">Free</th>
              <th className="px-3 py-3 font-semibold">Occupied</th>
              <th className="px-3 py-3 font-semibold">Vehicles</th>
              <th className="px-3 py-3 font-semibold">Outside slots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {logs.map((l) => {
              const usage = l.total_slots ? Math.round((l.occupied_slots / l.total_slots) * 100) : 0;
              return (
                <tr key={l.id} className="transition hover:bg-stone-50 dark:hover:bg-stone-800/40">
                  <td className="px-5 py-3 font-mono text-xs text-stone-500">{l.created_at}</td>
                  <td className="px-3 py-3 font-semibold">{l.total_slots}</td>
                  <td className="px-3 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{l.free_slots}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 font-semibold text-rose-600 dark:text-rose-400">{l.occupied_slots}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                        <span className="block h-full rounded-full bg-rose-500" style={{ width: `${usage}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">{l.cars_detected}</td>
                  <td className="px-3 py-3">
                    {l.cars_outside_slots > 0 ? (
                      <span className="chip bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">{l.cars_outside_slots}</span>
                    ) : (
                      <span className="text-stone-400">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-stone-500">
                  No history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Activity, Download, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { getLogs } from "../api";
import { Item, Reveal, Stagger } from "../motion";
import type { Log } from "../types";
import AreaChart from "./AreaChart";
import LogsTable from "./LogsTable";

const RANGES = [
  { rows: 30, label: "5 min" },
  { rows: 90, label: "15 min" },
  { rows: 360, label: "1 hour" },
]; // one history row is saved every 10 seconds

// How busy the car park has been: chart + table of detection_logs
export default function History() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [range, setRange] = useState(RANGES[0].rows);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getLogs(range)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [range]);

  const ordered = [...logs].reverse(); // the API gives newest first; charts read left to right
  const labels = ordered.map((l) => l.created_at.slice(11, 16));
  const avgFree = logs.length ? Math.round(logs.reduce((a, l) => a + l.free_slots, 0) / logs.length) : 0;
  const peak = logs.length ? Math.max(...logs.map((l) => l.occupied_slots)) : 0;
  const trend = logs.length > 1 ? logs[0].free_slots - logs[logs.length - 1].free_slots : 0;

  const exportCsv = () => {
    const rows = [
      "time,total,free,occupied,vehicles,outside_slots",
      ...ordered.map((l) => [l.created_at, l.total_slots, l.free_slots, l.occupied_slots, l.cars_detected, l.cars_outside_slots].join(",")),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    link.download = "parking-history.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        <Item className="card p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Average free spaces</p>
          <p className="mt-1 text-3xl font-extrabold text-emerald-600 tabular-nums dark:text-emerald-400">{avgFree}</p>
        </Item>
        <Item className="card p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Busiest moment</p>
          <p className="mt-1 text-3xl font-extrabold text-rose-600 tabular-nums dark:text-rose-400">{peak} <span className="text-base font-semibold text-stone-400">occupied</span></p>
        </Item>
        <Item className="card p-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">Trend in this period</p>
          <p className={`mt-1 flex items-center gap-2 text-3xl font-extrabold tabular-nums ${trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {trend >= 0 ? <TrendingUp className="size-7" /> : <TrendingDown className="size-7" />}
            {trend > 0 ? "+" : ""}
            {trend} <span className="text-base font-semibold text-stone-400">free</span>
          </p>
        </Item>
      </Stagger>

      <Reveal className="card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex items-center gap-2">
            <Activity className="size-5 text-brand-600" />
            <h2 className="font-semibold">Free vs occupied over time</h2>
          </div>
          <div className="flex rounded-xl bg-stone-100 p-1 text-xs font-semibold dark:bg-stone-800">
            {RANGES.map((r) => (
              <button
                key={r.rows}
                onClick={() => setRange(r.rows)}
                className={`rounded-lg px-3 py-1.5 transition ${range === r.rows ? "bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-white" : "text-stone-500"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={load} className="btn-ghost !p-2" title="Refresh">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCsv} disabled={!logs.length} className="btn-ghost !py-2 text-xs">
            <Download className="size-4" /> CSV
          </button>
        </div>
        <AreaChart
          key={range} // redraw the lines when the time range changes
          labels={labels}
          series={[
            { label: "Free", color: "#10b981", values: ordered.map((l) => l.free_slots) },
            { label: "Occupied", color: "#f43f5e", values: ordered.map((l) => l.occupied_slots) },
            { label: "Vehicles", color: "#6366f1", values: ordered.map((l) => l.cars_detected) },
          ]}
        />
      </Reveal>

      <Reveal>
        <LogsTable logs={logs.slice(0, 25)} />
      </Reveal>
    </div>
  );
}

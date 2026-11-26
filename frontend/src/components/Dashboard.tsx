import { useEffect, useState } from "react";
import { getLogs, getSlots, getStatus } from "../api";
import type { Log, Slot, Status } from "../types";
import LiveFeed from "./LiveFeed";
import LogsTable from "./LogsTable";
import SlotMap from "./SlotMap";
import SourcePanel from "./SourcePanel";
import StatCard from "./StatCard";

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [offline, setOffline] = useState(false);

  // ask the backend for fresh data every 2 seconds
  useEffect(() => {
    const load = async () => {
      try {
        const [st, sl, lg] = await Promise.all([getStatus(), getSlots(), getLogs()]);
        setStatus(st);
        setSlots(sl);
        setLogs(lg);
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {offline && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
          Cannot reach the backend at http://localhost:8000. Start it with:
          <code className="ml-1 font-mono">uvicorn main:app --port 8000</code>
        </div>
      )}
      {status?.error && (
        <div className="bg-amber-100 text-amber-800 p-3 rounded-lg text-sm">AI: {status.error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Slots" value={status?.total_slots ?? 0} color="text-slate-800" />
        <StatCard label="Free Slots" value={status?.free_slots ?? 0} color="text-green-600" />
        <StatCard label="Occupied" value={status?.occupied_slots ?? 0} color="text-red-600" />
        <StatCard label="Vehicles Seen" value={status?.cars_detected ?? 0} color="text-blue-600" />
        <StatCard label="Outside Slots" value={status?.cars_outside_slots ?? 0} color="text-amber-600" />
      </div>
      <p className="text-xs text-slate-500">
        AI agent: {status?.ai_running ? "running" : "starting..."} | last update:{" "}
        {status?.last_update ?? "-"}
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveFeed />
        </div>
        <div className="space-y-6">
          <SourcePanel current={status?.source ?? ""} />
          <SlotMap slots={slots} />
        </div>
      </div>

      <LogsTable logs={logs} />
    </div>
  );
}

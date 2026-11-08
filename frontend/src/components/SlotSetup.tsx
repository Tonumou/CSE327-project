import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Accessibility, Camera, MousePointerClick, RefreshCw, Search, ScanSearch, Square, Trash2, Zap } from "lucide-react";
import { addSlot, autoSlots, deleteAllSlots, deleteSlot, frameUrl, getSlots, setSlotType } from "../api";
import { useToast } from "../toast";
import type { Slot, SlotType } from "../types";

interface Point {
  x: number;
  y: number;
}

type Shape = "rect" | "corners";

// "A1" -> "A2", "B9" -> "B10"
const nextCode = (c: string) => {
  const m = c.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (parseInt(m[2]) + 1) : c + "1";
};

// colour of each slot on the picture, by its live status
const FILL: Record<Slot["status"], [string, string]> = {
  free: ["rgba(16,185,129,0.25)", "#10b981"],
  reserved: ["rgba(245,158,11,0.25)", "#f59e0b"],
  occupied: ["rgba(244,63,94,0.25)", "#f43f5e"],
};

// Operator marks every parking space on a camera snapshot, either by dragging a
// rectangle or by clicking its 4 corners (for tilted / diagonal spaces).
// The shapes are saved in MySQL and the AI compares cars against them.
export default function SlotSetup() {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState(frameUrl(false));
  const [size, setSize] = useState({ w: 0, h: 0 }); // real picture size in pixels
  const [slots, setSlots] = useState<Slot[]>([]);
  const [code, setCode] = useState("A1");
  const [shape, setShape] = useState<Shape>("rect");
  const [start, setStart] = useState<Point | null>(null); // rectangle: drag start
  const [current, setCurrent] = useState<Point | null>(null); // mouse position
  const [corners, setCorners] = useState<Point[]>([]); // 4-corner mode: clicks so far
  const [highlight, setHighlight] = useState<number | null>(null); // slot hovered in the list
  const [query, setQuery] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [noFrame, setNoFrame] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const loadSlots = () =>
    getSlots()
      .then((list) => {
        setSlots(list);
        // skip codes that are already used, so the next slot never gets a duplicate name
        const used = new Set(list.map((s) => s.slot_code));
        setCode((c) => {
          while (used.has(c)) c = nextCode(c);
          return c;
        });
      })
      .catch(() => toast("error", "Backend is offline"));

  useEffect(() => {
    loadSlots();
  }, []);

  // convert a mouse position on screen into picture pixel coordinates
  const toImagePoint = (e: MouseEvent): Point => {
    const box = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - box.left) / box.width) * size.w),
      y: Math.round(((e.clientY - box.top) / box.height) * size.h),
    };
  };

  const save = async (slot: Omit<Slot, "id" | "status" | "updated_at">) => {
    try {
      await addSlot(slot);
      toast("success", `Slot ${slot.slot_code} saved.`);
      setCode(nextCode(slot.slot_code));
      loadSlots();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  // ----- rectangle mode: press, drag, release -----
  const finishRect = () => {
    if (shape !== "rect" || !start || !current) return;
    setStart(null);
    save({ slot_code: code, x1: start.x, y1: start.y, x2: current.x, y2: current.y, points: null });
  };

  // ----- 4-corner mode: click 4 times -----
  const addCorner = (e: MouseEvent) => {
    if (shape !== "corners") return;
    const list = [...corners, toImagePoint(e)];
    if (list.length < 4) {
      setCorners(list);
      return;
    }
    setCorners([]);
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    save({
      slot_code: code,
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
      points: list.map((p) => [p.x, p.y]),
    });
  };

  const changeShape = (s: Shape) => {
    setShape(s);
    setStart(null);
    setCorners([]);
  };

  const removeSlot = async (s: Slot) => {
    await deleteSlot(s.id);
    toast("info", `Slot ${s.slot_code} deleted.`);
    loadSlots();
  };

  // Feature 3: EV / handicapped slots get their own tariff on the booking page
  const changeType = async (id: number, type: SlotType) => {
    try {
      await setSlotType(id, type);
      loadSlots();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const autoDetect = async () => {
    if (slots.length > 0 && !confirm("This replaces ALL saved slots. Continue?")) return;
    setDetecting(true);
    try {
      const r = await autoSlots();
      toast("success", `Found ${r.slots} parking spaces (${r.free} free) and ${r.cars} vehicles.`);
      setSnapshot(frameUrl(false));
      loadSlots();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setDetecting(false);
    }
  };

  const removeAll = async () => {
    if (!confirm("Delete ALL slots?")) return;
    await deleteAllSlots();
    setCode("A1");
    toast("info", "All slots deleted.");
    loadSlots();
  };

  // line width / text size relative to the picture, so they look the same on any photo
  const stroke = Math.max(2, size.w / 400);
  const fontSize = Math.max(14, size.w / 45);
  const toSvg = (pts: number[][]) => pts.map((p) => p.join(",")).join(" ");
  const listed = slots
    .filter((s) => s.slot_code.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.slot_code.localeCompare(b.slot_code, undefined, { numeric: true })); // P2 before P10

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {/* ---------- drawing area ---------- */}
      <div className="card p-5 xl:col-span-2">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-stone-100 p-1 text-sm font-semibold dark:bg-stone-800">
            {[
              { s: "rect" as Shape, label: "Rectangle", icon: <Square className="size-4" /> },
              { s: "corners" as Shape, label: "4 corners", icon: <MousePointerClick className="size-4" /> },
            ].map((b) => (
              <button
                key={b.s}
                onClick={() => changeShape(b.s)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  shape === b.s ? "bg-white text-brand-700 shadow-sm dark:bg-stone-700 dark:text-white" : "text-stone-500"
                }`}
              >
                {b.icon} {b.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-1.5 text-sm dark:border-stone-700">
            <span className="text-stone-500">Next code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="w-16 bg-transparent font-bold outline-none" />
          </div>
          <button onClick={() => setSnapshot(frameUrl(false))} className="btn-ghost ml-auto !py-2 text-xs">
            <RefreshCw className="size-4" /> New snapshot
          </button>
        </div>

        <div className="mb-4 flex items-start gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          <MousePointerClick className="mt-0.5 size-4 shrink-0" />
          {shape === "rect" ? (
            <span>
              Press on one corner of a <b>whole</b> parking space, drag to the opposite corner and release. Best for straight spaces.
            </span>
          ) : (
            <span>
              Click the <b>4 corners</b> of one parking space on its painted lines - after the 4th click it is saved. Best for diagonal spaces.
              {corners.length > 0 && <b className="ml-1">({corners.length}/4 clicked)</b>}
            </span>
          )}
        </div>

        {/* whole picture fits on screen (max 70% of window height) so no scrolling while drawing */}
        <div className="relative mx-auto w-fit select-none overflow-hidden rounded-xl bg-stone-950">
          {noFrame && (
            <div className="flex h-64 w-[min(36rem,80vw)] flex-col items-center justify-center gap-2 text-stone-400">
              <Camera className="size-10 opacity-40" />
              <p className="text-sm">No camera picture yet - choose a source on the dashboard.</p>
            </div>
          )}
          <img
            src={snapshot}
            alt="Camera snapshot"
            className={`block max-h-[70vh] max-w-full ${noFrame ? "hidden" : ""}`}
            onLoad={(e) => {
              setNoFrame(false);
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            }}
            onError={() => setNoFrame(true)}
          />
          {size.w > 0 && !noFrame && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onMouseDown={(e) => {
                if (shape !== "rect") return;
                const p = toImagePoint(e);
                setStart(p);
                setCurrent(p);
              }}
              onMouseMove={(e) => setCurrent(toImagePoint(e))}
              onMouseUp={finishRect}
              onClick={addCorner}
              onMouseLeave={() => setStart(null)} // left the picture -> cancel the rectangle
            >
              {slots.map((s) => {
                const [fill, line] = FILL[s.status];
                const lit = highlight === s.id;
                return (
                  <g key={s.id}>
                    <polygon
                      points={toSvg(s.points ?? [[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]])}
                      fill={lit ? "rgba(99,102,241,0.45)" : fill}
                      stroke={lit ? "#6366f1" : line}
                      strokeWidth={lit ? stroke * 2 : stroke}
                    />
                    <text x={s.x1 + fontSize / 3} y={s.y1 + fontSize} fill="#fff" stroke="#0f172a" strokeWidth={stroke / 2} fontSize={fontSize} fontWeight="bold">
                      {s.slot_code}
                    </text>
                  </g>
                );
              })}

              {/* rectangle being dragged */}
              {shape === "rect" && start && current && (
                <rect
                  x={Math.min(start.x, current.x)}
                  y={Math.min(start.y, current.y)}
                  width={Math.abs(current.x - start.x)}
                  height={Math.abs(current.y - start.y)}
                  fill="rgba(250,204,21,0.3)"
                  stroke="#facc15"
                  strokeWidth={stroke}
                  strokeDasharray={`${stroke * 3} ${stroke * 2}`}
                />
              )}

              {/* corners clicked so far + line to the mouse */}
              {shape === "corners" && corners.length > 0 && (
                <>
                  <polyline
                    points={toSvg([...corners, ...(current ? [current] : [])].map((p) => [p.x, p.y]))}
                    fill="rgba(250,204,21,0.3)"
                    stroke="#facc15"
                    strokeWidth={stroke}
                  />
                  {corners.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={stroke * 2.5} fill="#facc15" />
                  ))}
                </>
              )}
            </svg>
          )}
        </div>
      </div>

      {/* ---------- side panel ---------- */}
      <div className="space-y-6">
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <ScanSearch className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400" />
            <div>
              <h3 className="font-semibold">Find spaces automatically</h3>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                Reads the painted bay lines and the parked cars in the current picture. Check the result and add or remove bays by hand.
              </p>
            </div>
          </div>
          <button onClick={autoDetect} disabled={detecting} className="btn-primary mt-4 w-full">
            {detecting ? <RefreshCw className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {detecting ? "Looking for bays..." : "Detect bays in this picture"}
          </button>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Saved slots <span className="text-stone-400">({slots.length})</span></h3>
            {slots.length > 0 && (
              <button onClick={removeAll} className="btn-danger !px-2.5 !py-1 text-xs">
                <Trash2 className="size-3.5" /> Delete all
              </button>
            )}
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search slots" className="input !py-2 pl-9" />
          </div>
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {listed.map((s) => (
              <li
                key={s.id}
                onMouseEnter={() => setHighlight(s.id)}
                onMouseLeave={() => setHighlight(null)}
                className="flex items-center gap-2 rounded-xl border border-stone-100 p-2 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-stone-800 dark:hover:bg-brand-500/10"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: FILL[s.status][1] }} title={s.status} />
                <span className="w-12 font-bold">{s.slot_code}</span>
                <span className="text-stone-400">
                  {s.slot_type === "ev_charging" ? <Zap className="size-3.5" /> : s.slot_type === "handicapped" ? <Accessibility className="size-3.5" /> : null}
                </span>
                <select
                  value={s.slot_type ?? "standard"}
                  onChange={(e) => changeType(s.id, e.target.value as SlotType)}
                  className="ml-auto rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
                  title="Slot type (sets the hourly rate on the booking page)"
                >
                  <option value="standard">Standard</option>
                  <option value="ev_charging">EV charging</option>
                  <option value="handicapped">Accessible</option>
                </select>
                <button onClick={() => removeSlot(s)} className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" title="Delete">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            {listed.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No slots yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}

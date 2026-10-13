import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { addSlot, autoSlots, deleteAllSlots, deleteSlot, frameUrl, getSlots } from "../api";
import type { Slot } from "../types";

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

// Operator marks every parking space on a camera snapshot, either by dragging a
// rectangle or by clicking its 4 corners (for tilted / diagonal spaces).
// The shapes are saved in MySQL and the AI compares cars against them.
export default function SlotSetup() {
  const [snapshot, setSnapshot] = useState(frameUrl(false));
  const [size, setSize] = useState({ w: 0, h: 0 }); // real picture size in pixels
  const [slots, setSlots] = useState<Slot[]>([]);
  const [code, setCode] = useState("A1");
  const [shape, setShape] = useState<Shape>("rect");
  const [start, setStart] = useState<Point | null>(null); // rectangle: drag start
  const [current, setCurrent] = useState<Point | null>(null); // mouse position
  const [corners, setCorners] = useState<Point[]>([]); // 4-corner mode: clicks so far
  const [message, setMessage] = useState("");
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
      .catch(() => setMessage("Backend is offline"));

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
      setMessage(`Slot ${slot.slot_code} saved.`);
      setCode(nextCode(slot.slot_code));
      loadSlots();
    } catch (e) {
      setMessage((e as Error).message);
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

  const removeSlot = async (id: number) => {
    await deleteSlot(id);
    loadSlots();
  };

  const autoDetect = async () => {
    if (slots.length > 0 && !confirm("This replaces ALL saved slots. Continue?")) return;
    setMessage("Searching the picture for parking spaces...");
    try {
      const r = await autoSlots();
      setMessage(`Found ${r.slots} parking spaces (${r.free} free) and ${r.cars} vehicles.`);
      setSnapshot(frameUrl(false));
      loadSlots();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const removeAll = async () => {
    if (!confirm("Delete ALL slots?")) return;
    await deleteAllSlots();
    setCode("A1");
    loadSlots();
  };

  // line width / text size relative to the picture, so they look the same on any photo
  const stroke = Math.max(2, size.w / 400);
  const fontSize = Math.max(14, size.w / 45);
  const toSvg = (pts: number[][]) => pts.map((p) => p.join(",")).join(" ");

  const shapeButton = (s: Shape, label: string) => (
    <button
      onClick={() => changeShape(s)}
      className={`px-3 py-1 rounded-lg text-sm ${
        shape === s ? "bg-blue-600 text-white" : "bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex gap-2">
            {shapeButton("rect", "Rectangle (drag)")}
            {shapeButton("corners", "4 corners (click)")}
          </div>
          <button
            onClick={() => setSnapshot(frameUrl(false))}
            className="bg-slate-200 px-3 py-1 rounded-lg text-sm"
          >
            New snapshot
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          {shape === "rect" ? (
            <>
              Press on one corner of a <b>whole</b> parking space, drag to the opposite corner and
              release. Best for straight spaces.
            </>
          ) : (
            <>
              Click the <b>4 corners</b> of one parking space (on its painted lines). After the 4th
              click the slot is saved. Best for diagonal / tilted spaces.
              {corners.length > 0 && <b> Corners clicked: {corners.length}/4</b>}
            </>
          )}
        </p>

        {/* whole picture fits on screen (max 75% of window height) so no scrolling while drawing */}
        <div className="relative select-none w-fit mx-auto">
          <img
            src={snapshot}
            alt="Camera snapshot"
            className="block max-w-full max-h-[75vh] rounded-lg bg-slate-200 min-h-40"
            onLoad={(e) =>
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            onError={() => setMessage("No camera frame yet - start the backend and wait a few seconds.")}
          />
          {size.w > 0 && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full cursor-crosshair"
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
              {slots.map((s) => (
                <g key={s.id}>
                  <polygon
                    points={toSvg(s.points ?? [[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]])}
                    fill="rgba(37,99,235,0.25)"
                    stroke="#2563eb"
                    strokeWidth={stroke}
                  />
                  <text
                    x={s.x1 + fontSize / 3}
                    y={s.y1 + fontSize}
                    fill="#fff"
                    stroke="#1e3a8a"
                    strokeWidth={stroke / 2}
                    fontSize={fontSize}
                    fontWeight="bold"
                  >
                    {s.slot_code}
                  </text>
                </g>
              ))}

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

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <button
          onClick={autoDetect}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg"
        >
          Auto-detect parking spaces
        </button>
        <p className="text-xs text-slate-500">
          The AI finds spaces from the white painted lines and around every parked car it sees.
          Empty spaces without clear lines can't be found - add them by hand afterwards.
        </p>
        <label className="block text-sm font-medium">
          Code for the next slot
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="block w-full border rounded-lg px-3 py-2 mt-1"
          />
        </label>
        {message && <p className="text-sm text-blue-700">{message}</p>}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Saved slots ({slots.length})</h3>
            {slots.length > 0 && (
              <button onClick={removeAll} className="text-xs text-red-600">
                Delete all
              </button>
            )}
          </div>
          <ul className="divide-y text-sm max-h-96 overflow-y-auto">
            {slots.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <span>
                  <b>{s.slot_code}</b>{" "}
                  <span className="text-slate-500">{s.points ? "4 corners" : "rectangle"}</span>
                </span>
                <button onClick={() => removeSlot(s.id)} className="text-red-600 text-xs">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

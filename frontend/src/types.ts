// Shapes of the JSON data returned by the FastAPI backend

export interface Slot {
  id: number;
  slot_code: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: number[][] | null; // 4 corners of a tilted slot, null = rectangle
  status: "free" | "occupied";
  updated_at: string;
}

export interface Status {
  total_slots: number;
  free_slots: number;
  occupied_slots: number;
  cars_detected: number;
  cars_outside_slots: number;
  last_update: string | null;
  source: string;
  ai_running: boolean;
  error: string;
  frame_width: number;
  frame_height: number;
}

export interface Log {
  id: number;
  total_slots: number;
  free_slots: number;
  occupied_slots: number;
  cars_detected: number;
  cars_outside_slots: number;
  created_at: string;
}

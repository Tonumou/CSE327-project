import { useState } from "react";
import Dashboard from "./components/Dashboard";
import SlotSetup from "./components/SlotSetup";

type Page = "dashboard" | "setup";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  const tab = (name: Page, label: string) => (
    <button
      onClick={() => setPage(name)}
      className={`px-4 py-2 rounded-lg text-sm font-medium ${
        page === name ? "bg-white text-blue-700" : "text-blue-100 hover:bg-blue-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="bg-blue-700 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Smart Parking</h1>
            <p className="text-xs text-blue-100">Live Free-Slot Counting from Camera Feed - YOLO AI</p>
          </div>
          <nav className="flex gap-2">
            {tab("dashboard", "Live Dashboard")}
            {tab("setup", "Slot Setup")}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {page === "dashboard" ? <Dashboard /> : <SlotSetup />}
      </main>
    </div>
  );
}

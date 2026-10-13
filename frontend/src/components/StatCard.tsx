interface Props {
  label: string;
  value: number | string;
  color: string; // Tailwind text colour class, e.g. "text-green-600"
}

export default function StatCard({ label, value, color }: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

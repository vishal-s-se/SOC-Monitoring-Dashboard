export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toUpperCase();
  
  let colorClass = "bg-gray-800 text-gray-300";
  if (s === "CRITICAL") {
    colorClass = "bg-red-600 text-white border-red-500";
  } else if (s === "HIGH") {
    colorClass = "bg-orange-500/10 text-orange-400 border-orange-500/20";
  } else if (s === "MEDIUM") {
    colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  } else if (s === "LOW" || s === "INFO") {
    colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {s}
    </span>
  );
}

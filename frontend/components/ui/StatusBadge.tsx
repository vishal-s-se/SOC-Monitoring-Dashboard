export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  
  let colorClass = "bg-gray-800 text-gray-300";
  if (s === "ONLINE" || s === "OPEN" || s === "NEW") {
    colorClass = "bg-green-500/10 text-green-400 border-green-500/20";
  } else if (s === "OFFLINE" || s === "ERROR") {
    colorClass = "bg-red-500/10 text-red-400 border-red-500/20";
  } else if (s === "ACKNOWLEDGED" || s === "PROCESSED") {
    colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  } else if (s === "RESOLVED") {
    colorClass = "bg-purple-500/10 text-purple-400 border-purple-500/20";
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {s}
    </span>
  );
}

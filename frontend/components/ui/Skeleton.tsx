import React from "react";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-800/70 ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({
  rows = 5,
  cols,
  columns = 4,
}: {
  rows?: number;
  cols?: number;
  columns?: number;
}) {
  const columnCount = cols ?? columns ?? 4;
  return (
    <div className="space-y-3 p-4">
      <div className="flex space-x-4 border-b border-gray-800 pb-3">
        {Array.from({ length: columnCount }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 bg-gray-800/80" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex space-x-4 py-2 border-b border-gray-800/40">
          {Array.from({ length: columnCount }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 flex-1 ${c === 0 ? "max-w-[140px]" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricCardSkeleton({ count }: { count?: number } = {}) {
  if (count !== undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-2">
            <Skeleton className="h-3 w-24 bg-gray-800" />
            <Skeleton className="h-7 w-16 bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-2">
      <Skeleton className="h-3 w-24 bg-gray-800" />
      <Skeleton className="h-7 w-16 bg-gray-700" />
    </div>
  );
}

export function ChartCardSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-5 ${height} flex flex-col justify-between`}>
      <Skeleton className="h-4 w-36 bg-gray-800" />
      <div className="flex items-end space-x-2 h-3/4 pt-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            // Use static heights based on modulo to avoid React hydration mismatches
            style={{ height: `${25 + ((i * 17) % 65)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

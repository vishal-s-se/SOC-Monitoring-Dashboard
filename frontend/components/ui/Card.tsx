export function Card({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, title, subtitle }: { children?: React.ReactNode, title?: string, subtitle?: string }) {
  return (
    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
      <div>
        {title && <h3 className="text-lg font-medium text-gray-100">{title}</h3>}
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function CardContent({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

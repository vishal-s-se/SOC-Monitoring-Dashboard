export function EmptyState({ title, description, icon }: { title: string, description: string, icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-gray-800 rounded-lg bg-gray-900/50">
      {icon && <div className="text-gray-500 mb-4">{icon}</div>}
      <h3 className="text-lg font-medium text-gray-200">{title}</h3>
      <p className="mt-2 text-sm text-gray-400 max-w-sm">{description}</p>
    </div>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string, retry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-red-900/10 border border-red-500/20 rounded-lg">
      <div className="text-red-400 mb-2">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-red-400">Error</h3>
      <p className="mt-1 text-sm text-red-300/70">{message}</p>
      {retry && (
        <button 
          onClick={retry}
          className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string, description?: string, actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      </div>
      {actions && <div className="mt-4 sm:mt-0">{actions}</div>}
    </div>
  );
}

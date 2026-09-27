export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-gray-900 border border-gray-800 rounded-lg">
      {children}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "All"
}: {
  label: string,
  value: string,
  onChange: (val: string) => void,
  options: {value: string, label: string}[],
  placeholder?: string
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder = ""
}: {
  label: string,
  value: string,
  onChange: (val: string) => void,
  placeholder?: string
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
      />
    </div>
  );
}

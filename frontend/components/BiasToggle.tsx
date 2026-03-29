"use client";

interface BiasToggleProps {
  current: string;
  onChange: (bias: string) => void;
  antiLabel: string;
  proLabel: string;
}

export default function BiasToggle({
  current,
  onChange,
  antiLabel,
  proLabel,
}: BiasToggleProps) {
  const options = [
    { value: "anti-war", label: antiLabel },
    { value: "neutral", label: "Neutral" },
    { value: "pro-war", label: proLabel },
  ];

  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-700">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-5 py-2.5 text-sm font-medium transition-colors ${
            current === opt.value
              ? opt.value === "anti-war"
                ? "bg-red-600 text-white"
                : opt.value === "pro-war"
                ? "bg-blue-600 text-white"
                : "bg-gray-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

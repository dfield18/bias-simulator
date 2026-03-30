"use client";

import { useState } from "react";

interface SearchPillsProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Parse a query string into include terms and exclude terms.
 * e.g. '"immigration reform" OR "border security" -spam -bot'
 * -> include: ["immigration reform", "border security"], exclude: ["spam", "bot"]
 */
function parseQuery(query: string): { include: string[]; exclude: string[] } {
  if (!query.trim()) return { include: [], exclude: [] };

  const include: string[] = [];
  const exclude: string[] = [];

  // First extract exclude terms (prefixed with -)
  const excludeRegex = /\s+-"([^"]+)"|\s+-(\S+)/g;
  let cleaned = query;
  let match;
  while ((match = excludeRegex.exec(query)) !== null) {
    const term = (match[1] || match[2]).trim();
    if (term) exclude.push(term);
  }
  // Remove exclude terms from the string
  cleaned = cleaned.replace(/\s+-"[^"]+"/g, "").replace(/\s+-\S+/g, "").trim();

  // Split remaining by OR for include terms
  if (cleaned) {
    cleaned.split(/\s+OR\s+/i).forEach((t) => {
      const term = t.trim().replace(/^["']|["']$/g, "");
      if (term) include.push(term);
    });
  }

  return { include, exclude };
}

function buildQuery(include: string[], exclude: string[]): string {
  const includePart = include
    .map((t) => (t.includes(" ") ? `"${t}"` : t))
    .join(" OR ");
  const excludePart = exclude
    .map((t) => (t.includes(" ") ? `-"${t}"` : `-${t}`))
    .join(" ");
  return [includePart, excludePart].filter(Boolean).join(" ");
}

function PillBox({
  terms,
  onAdd,
  onRemove,
  label,
  description,
  placeholder,
  pillClass,
  buttonClass,
  buttonLabel,
}: {
  terms: string[];
  onAdd: (term: string) => void;
  onRemove: (index: number) => void;
  label: string;
  description: string;
  placeholder: string;
  pillClass: string;
  buttonClass: string;
  buttonLabel: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const cleaned = inputValue.trim().replace(/^["']|["']$/g, "");
    if (cleaned && !terms.includes(cleaned)) {
      onAdd(cleaned);
    }
    setInputValue("");
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <p className="text-[10px] text-gray-600 mb-2">{description}</p>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 min-h-[52px]">
        <div className="flex flex-wrap gap-2 mb-2">
          {terms.map((term, i) => (
            <span key={i} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${pillClass}`}>
              {term}
              <button
                onClick={() => onRemove(i)}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm leading-none"
              >
                &times;
              </button>
            </span>
          ))}
          {terms.length === 0 && (
            <span className="text-[10px] text-gray-600 italic">None added yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-gray-300 outline-none placeholder-gray-600"
          />
          <button
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            className={`px-3 py-1 text-xs font-medium disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors shrink-0 ${buttonClass}`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchPills({ value, onChange }: SearchPillsProps) {
  const { include, exclude } = parseQuery(value);

  const updateInclude = (newInclude: string[]) => {
    onChange(buildQuery(newInclude, exclude));
  };

  const updateExclude = (newExclude: string[]) => {
    onChange(buildQuery(include, newExclude));
  };

  return (
    <div className="space-y-4">
      <PillBox
        terms={include}
        onAdd={(term) => updateInclude([...include, term])}
        onRemove={(i) => updateInclude(include.filter((_, idx) => idx !== i))}
        label="Search Filters"
        description="Tweets matching any of these keywords or phrases will be collected."
        placeholder="Type a keyword or phrase and press Enter"
        pillClass="bg-gray-700 text-gray-200"
        buttonClass="bg-blue-600 hover:bg-blue-500"
        buttonLabel="+ Add"
      />
      <PillBox
        terms={exclude}
        onAdd={(term) => updateExclude([...exclude, term])}
        onRemove={(i) => updateExclude(exclude.filter((_, idx) => idx !== i))}
        label="Exclude Terms"
        description="Tweets containing any of these words will be excluded from results."
        placeholder="Type a word to exclude and press Enter"
        pillClass="bg-red-500/20 text-red-300"
        buttonClass="bg-red-600 hover:bg-red-500"
        buttonLabel="+ Exclude"
      />
      <p className="text-[10px] text-gray-600">
        {include.length} search filter{include.length !== 1 ? "s" : ""}
        {exclude.length > 0 && `, ${exclude.length} exclusion${exclude.length !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
}

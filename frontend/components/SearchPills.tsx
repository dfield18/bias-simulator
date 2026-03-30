"use client";

import { useState } from "react";

interface SearchPillsProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Converts an OR-separated query string into pill tags and back.
 * e.g. '"immigration reform" OR "border security" OR DACA' -> ["immigration reform", "border security", "DACA"]
 */
function queryToTerms(query: string): string[] {
  if (!query.trim()) return [];
  return query
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter((t) => t.length > 0);
}

function termsToQuery(terms: string[]): string {
  return terms
    .map((t) => (t.includes(" ") ? `"${t}"` : t))
    .join(" OR ");
}

export default function SearchPills({ value, onChange }: SearchPillsProps) {
  const [inputValue, setInputValue] = useState("");
  const terms = queryToTerms(value);

  const addTerm = (term: string) => {
    const cleaned = term.trim().replace(/^["']|["']$/g, "");
    if (!cleaned || terms.includes(cleaned)) return;
    onChange(termsToQuery([...terms, cleaned]));
    setInputValue("");
  };

  const removeTerm = (index: number) => {
    const updated = terms.filter((_, i) => i !== index);
    onChange(termsToQuery(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTerm(inputValue);
    }
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Search Filters</label>
      <p className="text-[10px] text-gray-600 mb-2">
        Each filter is a keyword or phrase to search for on Twitter. Tweets matching any of these will be collected.
      </p>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 min-h-[60px]">
        <div className="flex flex-wrap gap-2 mb-2">
          {terms.map((term, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 bg-gray-700 text-gray-200 text-xs px-2.5 py-1.5 rounded-lg"
            >
              {term}
              <button
                onClick={() => removeTerm(i)}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm leading-none"
                aria-label={`Remove ${term}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a keyword or phrase and press Enter"
            className="flex-1 bg-transparent text-sm text-gray-300 outline-none placeholder-gray-600"
          />
          <button
            onClick={() => addTerm(inputValue)}
            disabled={!inputValue.trim()}
            className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors shrink-0"
          >
            + Add
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-600 mt-1">
        {terms.length} filter{terms.length !== 1 ? "s" : ""} active
      </p>
    </div>
  );
}

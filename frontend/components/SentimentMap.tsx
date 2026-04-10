"use client";

import { useMemo, useState } from "react";
import { GeoStateData, GeoCountryData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";
import {
  US_OUTLINE, ALASKA_OUTLINE, HAWAII_OUTLINE,
  NORTH_AMERICA, SOUTH_AMERICA, EUROPE, AFRICA, ASIA, AUSTRALIA,
} from "@/lib/mapPaths";

const STATE_COORDS: Record<string, { x: number; y: number; name: string }> = {
  AL: { x: 580, y: 380, name: "Alabama" }, AK: { x: 150, y: 460, name: "Alaska" },
  AZ: { x: 220, y: 370, name: "Arizona" }, AR: { x: 500, y: 360, name: "Arkansas" },
  CA: { x: 110, y: 300, name: "California" }, CO: { x: 300, y: 280, name: "Colorado" },
  CT: { x: 730, y: 200, name: "Connecticut" }, DE: { x: 710, y: 260, name: "Delaware" },
  DC: { x: 700, y: 270, name: "Washington DC" }, FL: { x: 640, y: 440, name: "Florida" },
  GA: { x: 620, y: 380, name: "Georgia" }, HI: { x: 260, y: 470, name: "Hawaii" },
  ID: { x: 200, y: 170, name: "Idaho" }, IL: { x: 540, y: 270, name: "Illinois" },
  IN: { x: 570, y: 260, name: "Indiana" }, IA: { x: 480, y: 230, name: "Iowa" },
  KS: { x: 410, y: 300, name: "Kansas" }, KY: { x: 600, y: 300, name: "Kentucky" },
  LA: { x: 500, y: 420, name: "Louisiana" }, ME: { x: 760, y: 120, name: "Maine" },
  MD: { x: 700, y: 260, name: "Maryland" }, MA: { x: 740, y: 190, name: "Massachusetts" },
  MI: { x: 570, y: 200, name: "Michigan" }, MN: { x: 450, y: 150, name: "Minnesota" },
  MS: { x: 530, y: 390, name: "Mississippi" }, MO: { x: 490, y: 300, name: "Missouri" },
  MT: { x: 270, y: 130, name: "Montana" }, NE: { x: 390, y: 250, name: "Nebraska" },
  NV: { x: 160, y: 260, name: "Nevada" }, NH: { x: 740, y: 160, name: "New Hampshire" },
  NJ: { x: 720, y: 240, name: "New Jersey" }, NM: { x: 270, y: 370, name: "New Mexico" },
  NY: { x: 710, y: 180, name: "New York" }, NC: { x: 660, y: 320, name: "North Carolina" },
  ND: { x: 380, y: 140, name: "North Dakota" }, OH: { x: 610, y: 250, name: "Ohio" },
  OK: { x: 410, y: 350, name: "Oklahoma" }, OR: { x: 130, y: 160, name: "Oregon" },
  PA: { x: 680, y: 230, name: "Pennsylvania" }, RI: { x: 745, y: 200, name: "Rhode Island" },
  SC: { x: 650, y: 350, name: "South Carolina" }, SD: { x: 380, y: 190, name: "South Dakota" },
  TN: { x: 580, y: 330, name: "Tennessee" }, TX: { x: 380, y: 410, name: "Texas" },
  UT: { x: 230, y: 270, name: "Utah" }, VT: { x: 730, y: 150, name: "Vermont" },
  VA: { x: 670, y: 290, name: "Virginia" }, WA: { x: 140, y: 100, name: "Washington" },
  WV: { x: 640, y: 280, name: "West Virginia" }, WI: { x: 500, y: 180, name: "Wisconsin" },
  WY: { x: 280, y: 210, name: "Wyoming" },
};

// Approximate world map positions (Mercator-ish) for countries
const COUNTRY_COORDS: Record<string, { x: number; y: number }> = {
  "USA": { x: 200, y: 200 }, "Canada": { x: 200, y: 120 }, "Mexico": { x: 170, y: 280 },
  "UK": { x: 450, y: 140 }, "Ireland": { x: 430, y: 145 }, "France": { x: 470, y: 185 },
  "Germany": { x: 495, y: 165 }, "Spain": { x: 455, y: 210 }, "Italy": { x: 500, y: 200 },
  "Netherlands": { x: 480, y: 155 }, "Belgium": { x: 475, y: 165 }, "Sweden": { x: 510, y: 115 },
  "Norway": { x: 495, y: 105 }, "Switzerland": { x: 485, y: 185 }, "Portugal": { x: 440, y: 215 },
  "India": { x: 640, y: 270 }, "Japan": { x: 770, y: 205 }, "South Korea": { x: 745, y: 210 },
  "China": { x: 710, y: 220 }, "Taiwan": { x: 740, y: 255 }, "Hong Kong": { x: 725, y: 260 },
  "Singapore": { x: 700, y: 320 }, "Indonesia": { x: 710, y: 330 }, "Philippines": { x: 740, y: 290 },
  "Thailand": { x: 695, y: 285 }, "Australia": { x: 760, y: 400 }, "New Zealand": { x: 810, y: 430 },
  "Brazil": { x: 310, y: 350 }, "Argentina": { x: 280, y: 420 }, "Colombia": { x: 260, y: 310 },
  "Chile": { x: 265, y: 410 }, "Peru": { x: 250, y: 350 },
  "Nigeria": { x: 480, y: 300 }, "Kenya": { x: 550, y: 320 }, "Ghana": { x: 460, y: 300 },
  "South Africa": { x: 530, y: 410 }, "Israel": { x: 545, y: 225 }, "Turkey": { x: 540, y: 200 },
  "UAE": { x: 580, y: 255 }, "Pakistan": { x: 620, y: 245 },
};

function interpolateColor(ratio: number, antiRgb: number[], proRgb: number[], neutralRgb: number[]): string {
  if (ratio < 0.5) {
    const t = ratio / 0.5;
    return `rgb(${Math.round(antiRgb[0] + (neutralRgb[0] - antiRgb[0]) * t)}, ${Math.round(antiRgb[1] + (neutralRgb[1] - antiRgb[1]) * t)}, ${Math.round(antiRgb[2] + (neutralRgb[2] - antiRgb[2]) * t)})`;
  } else {
    const t = (ratio - 0.5) / 0.5;
    return `rgb(${Math.round(neutralRgb[0] + (proRgb[0] - neutralRgb[0]) * t)}, ${Math.round(neutralRgb[1] + (proRgb[1] - neutralRgb[1]) * t)}, ${Math.round(neutralRgb[2] + (proRgb[2] - neutralRgb[2]) * t)})`;
  }
}

interface SentimentMapProps {
  states: GeoStateData[];
  countries: GeoCountryData[];
  antiLabel: string;
  proLabel: string;
  colorScheme?: ColorScheme;
}

export default function SentimentMap({ states, countries, antiLabel, proLabel, colorScheme = "political" }: SentimentMapProps) {
  const [view, setView] = useState<"us" | "world">("us");
  const [hovered, setHovered] = useState<string | null>(null);
  const sc = getSideColors(colorScheme);

  const antiRgb = useMemo(() => {
    const m = sc.anti.fill.match(/\d+/g);
    return m ? m.map(Number) : [59, 130, 246];
  }, [sc]);
  const proRgb = useMemo(() => {
    const m = sc.pro.fill.match(/\d+/g);
    return m ? m.map(Number) : [239, 68, 68];
  }, [sc]);
  const neutralRgb = [107, 114, 128];

  const stateMap = useMemo(() => {
    const map: Record<string, GeoStateData> = {};
    for (const s of states) map[s.state] = s;
    return map;
  }, [states]);

  const countryMap = useMemo(() => {
    const map: Record<string, GeoCountryData> = {};
    for (const c of countries) map[c.country] = c;
    return map;
  }, [countries]);

  const maxStateTotal = useMemo(() => Math.max(...states.map(s => s.total), 1), [states]);
  const maxCountryTotal = useMemo(() => Math.max(...countries.map(c => c.total), 1), [countries]);
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const renderTooltip = (name: string, data: { anti_count: number; pro_count: number; neutral_count: number; total: number }) => (
    <div className="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs pointer-events-none z-10">
      <div className="font-semibold text-gray-200 mb-1">{name}</div>
      <div className="space-y-0.5 text-[10px]">
        <div className={sc.anti.text}>{antiLabel}: {data.anti_count}</div>
        <div className={sc.pro.text}>{proLabel}: {data.pro_count}</div>
        <div className="text-gray-400">Neutral: {data.neutral_count}</div>
        <div className="text-gray-500 pt-0.5 border-t border-gray-700 mt-1">Total: {fmt(data.total)} posts</div>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Sentiment Map</div>
          <h3 className="text-sm font-semibold text-gray-300">
            {view === "us" ? "US sentiment by state" : "International sentiment by country"}
          </h3>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Color shows sentiment ratio. Size reflects post volume.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5 shrink-0">
          <button
            onClick={() => { setView("us"); setHovered(null); }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              view === "us" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            US
          </button>
          <button
            onClick={() => { setView("world"); setHovered(null); }}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              view === "world" ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            International
          </button>
        </div>
      </div>

      <div className="relative">
        {view === "us" ? (
          <svg viewBox="0 0 850 500" className="w-full" style={{ maxHeight: 400 }}>
            <rect width="850" height="500" fill="transparent" />
            {/* Continental US outline (state borders) */}
            <path d={US_OUTLINE} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="0.5" strokeOpacity="0.4" />
            {/* Alaska outline */}
            <path d={ALASKA_OUTLINE} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="0.5" strokeOpacity="0.3" />
            {/* Hawaii outline */}
            <path d={HAWAII_OUTLINE} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="0.5" strokeOpacity="0.3" />
            {Object.entries(STATE_COORDS).map(([abbr, { x, y, name }]) => {
              const data = stateMap[abbr];
              let fillColor = "rgb(31, 41, 55)";
              let opacity = 0.3;
              let radius = 12;

              if (data && data.total > 0) {
                fillColor = interpolateColor(data.ratio, antiRgb, proRgb, neutralRgb);
                opacity = 0.5 + (data.total / maxStateTotal) * 0.5;
                radius = 10 + (data.total / maxStateTotal) * 20;
              }

              return (
                <g key={abbr}
                  onMouseEnter={() => setHovered(abbr)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: data ? "pointer" : "default" }}
                >
                  <circle cx={x} cy={y} r={radius} fill={fillColor} fillOpacity={opacity}
                    stroke={hovered === abbr ? "rgb(209, 213, 219)" : "rgb(55, 65, 81)"}
                    strokeWidth={hovered === abbr ? 2 : 0.5} />
                  <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                    fill={data && data.total > 0 ? "white" : "rgb(75, 85, 99)"}
                    fontSize={radius > 16 ? 10 : 8} fontWeight="600" style={{ pointerEvents: "none" }}>
                    {abbr}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <svg viewBox="0 0 900 480" className="w-full" style={{ maxHeight: 400 }}>
            <rect width="900" height="480" fill="transparent" />
            {/* Continent outlines */}
            <path d={NORTH_AMERICA} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            <path d={SOUTH_AMERICA} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            <path d={EUROPE} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            <path d={AFRICA} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            <path d={ASIA} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            <path d={AUSTRALIA} fill="rgb(31, 41, 55)" fillOpacity="0.3" stroke="rgb(55, 65, 81)" strokeWidth="1" strokeOpacity="0.4" />
            {countries.map((c) => {
              const coords = COUNTRY_COORDS[c.country];
              if (!coords) return null;
              const fillColor = interpolateColor(c.ratio, antiRgb, proRgb, neutralRgb);
              const opacity = 0.5 + (c.total / maxCountryTotal) * 0.5;
              const radius = 12 + (c.total / maxCountryTotal) * 25;

              return (
                <g key={c.country}
                  onMouseEnter={() => setHovered(c.country)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={coords.x} cy={coords.y} r={radius} fill={fillColor} fillOpacity={opacity}
                    stroke={hovered === c.country ? "rgb(209, 213, 219)" : "rgb(55, 65, 81)"}
                    strokeWidth={hovered === c.country ? 2 : 0.5} />
                  <text x={coords.x} y={coords.y + 1} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize={radius > 18 ? 9 : 7} fontWeight="600" style={{ pointerEvents: "none" }}>
                    {c.country.length > 6 ? c.country.slice(0, 5) + "." : c.country}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {hovered && view === "us" && stateMap[hovered] && renderTooltip(
          STATE_COORDS[hovered]?.name || hovered,
          stateMap[hovered]
        )}
        {hovered && view === "world" && countryMap[hovered] && renderTooltip(
          hovered,
          countryMap[hovered]
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <span className={`text-[10px] font-medium ${sc.anti.text}`}>{antiLabel}</span>
        <div className="flex h-3 w-40 rounded-full overflow-hidden">
          <div style={{ flex: 1, background: sc.anti.fill, opacity: 0.8 }} />
          <div style={{ flex: 1, background: "rgb(107, 114, 128)", opacity: 0.5 }} />
          <div style={{ flex: 1, background: sc.pro.fill, opacity: 0.8 }} />
        </div>
        <span className={`text-[10px] font-medium ${sc.pro.text}`}>{proLabel}</span>
      </div>
      <div className="text-center text-[9px] text-gray-600 mt-1">Larger circles = more posts</div>
    </div>
  );
}

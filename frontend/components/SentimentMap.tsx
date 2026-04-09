"use client";

import { useMemo, useState, useEffect } from "react";
import { GeoStateData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";

// US state SVG paths — simplified outlines keyed by abbreviation
// We'll fetch these from a lightweight JSON endpoint at mount time

interface StateGeo {
  abbr: string;
  name: string;
  path: string;
}

// Pre-computed US state centroids and simplified SVG paths
// Using Albers USA projection coordinates
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
  antiLabel: string;
  proLabel: string;
  colorScheme?: ColorScheme;
}

export default function SentimentMap({ states, antiLabel, proLabel, colorScheme = "political" }: SentimentMapProps) {
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

  const maxTotal = useMemo(() => Math.max(...states.map(s => s.total), 1), [states]);
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const hoveredData = hovered ? stateMap[hovered] : null;
  const hoveredName = hovered ? STATE_COORDS[hovered]?.name || hovered : "";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Sentiment Map</div>
      <h3 className="text-sm font-semibold text-gray-300 mb-1">US sentiment by state</h3>
      <p className="text-[10px] text-gray-600 mb-3">
        Color shows sentiment ratio. Size reflects tweet volume. Based on user-set profile locations.
      </p>

      <div className="relative">
        <svg viewBox="0 0 850 500" className="w-full" style={{ maxHeight: 400 }}>
          <rect width="850" height="500" fill="transparent" />
          {Object.entries(STATE_COORDS).map(([abbr, { x, y, name }]) => {
            const data = stateMap[abbr];
            let fillColor = "rgb(31, 41, 55)";
            let opacity = 0.3;
            let radius = 12;

            if (data && data.total > 0) {
              fillColor = interpolateColor(data.ratio, antiRgb, proRgb, neutralRgb);
              opacity = 0.5 + (data.total / maxTotal) * 0.5;
              radius = 10 + (data.total / maxTotal) * 20;
            }

            const isHovered = hovered === abbr;

            return (
              <g key={abbr}
                onMouseEnter={() => setHovered(abbr)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: data ? "pointer" : "default" }}
              >
                <circle
                  cx={x} cy={y} r={radius}
                  fill={fillColor}
                  fillOpacity={opacity}
                  stroke={isHovered ? "rgb(209, 213, 219)" : "rgb(55, 65, 81)"}
                  strokeWidth={isHovered ? 2 : 0.5}
                />
                <text
                  x={x} y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={data && data.total > 0 ? "white" : "rgb(75, 85, 99)"}
                  fontSize={radius > 16 ? 10 : 8}
                  fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {abbr}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredData && (
          <div className="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs pointer-events-none z-10">
            <div className="font-semibold text-gray-200 mb-1">{hoveredName}</div>
            <div className="space-y-0.5 text-[10px]">
              <div className={sc.anti.text}>{antiLabel}: {hoveredData.anti_count}</div>
              <div className={sc.pro.text}>{proLabel}: {hoveredData.pro_count}</div>
              <div className="text-gray-400">Neutral: {hoveredData.neutral_count}</div>
              <div className="text-gray-500 pt-0.5 border-t border-gray-700 mt-1">Total: {fmt(hoveredData.total)} posts</div>
            </div>
          </div>
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

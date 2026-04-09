"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { GeoStateData } from "@/lib/api";
import { getSideColors, ColorScheme } from "@/lib/colors";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// FIPS code → state abbreviation
const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

function interpolateColor(ratio: number, antiRgb: number[], proRgb: number[], neutralRgb: number[]): string {
  // ratio: 0 = all anti, 0.5 = even, 1 = all pro
  if (ratio < 0.5) {
    const t = ratio / 0.5; // 0→1 from anti→neutral
    return `rgb(${Math.round(antiRgb[0] + (neutralRgb[0] - antiRgb[0]) * t)}, ${Math.round(antiRgb[1] + (neutralRgb[1] - antiRgb[1]) * t)}, ${Math.round(antiRgb[2] + (neutralRgb[2] - antiRgb[2]) * t)})`;
  } else {
    const t = (ratio - 0.5) / 0.5; // 0→1 from neutral→pro
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
  const [tooltip, setTooltip] = useState<{ name: string; data: GeoStateData } | null>(null);
  const sc = getSideColors(colorScheme);

  // Parse RGB values from color strings
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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Sentiment Map</div>
      <h3 className="text-sm font-semibold text-gray-300 mb-1">US sentiment by state</h3>
      <p className="text-[10px] text-gray-600 mb-3">
        Color shows sentiment ratio. Brightness reflects tweet volume. Based on user-set profile locations.
      </p>

      <div className="relative">
        <ComposableMap projection="geoAlbersUsa" width={800} height={500} style={{ width: "100%", height: "auto" }}>
          <ZoomableGroup>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const fips = geo.id;
                  const abbr = FIPS_TO_STATE[fips];
                  const data = abbr ? stateMap[abbr] : undefined;

                  let fillColor = "rgb(31, 41, 55)"; // gray-800 default
                  let opacity = 0.3;

                  if (data && data.total > 0) {
                    fillColor = interpolateColor(data.ratio, antiRgb, proRgb, neutralRgb);
                    // Opacity based on volume: min 0.4, max 1.0
                    opacity = 0.4 + (data.total / maxTotal) * 0.6;
                  }

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fillColor}
                      fillOpacity={opacity}
                      stroke="rgb(17, 24, 39)"
                      strokeWidth={0.5}
                      style={{
                        hover: { fillOpacity: 1, stroke: "rgb(209, 213, 219)", strokeWidth: 1 },
                      }}
                      onMouseEnter={() => {
                        if (data) setTooltip({ name: geo.properties.name, data });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute top-2 right-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs pointer-events-none z-10">
            <div className="font-semibold text-gray-200 mb-1">{tooltip.name}</div>
            <div className="space-y-0.5 text-[10px]">
              <div className={sc.anti.text}>{antiLabel}: {tooltip.data.anti_count}</div>
              <div className={sc.pro.text}>{proLabel}: {tooltip.data.pro_count}</div>
              <div className="text-gray-400">Neutral: {tooltip.data.neutral_count}</div>
              <div className="text-gray-500 pt-0.5 border-t border-gray-700 mt-1">Total: {fmt(tooltip.data.total)} posts</div>
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
      <div className="text-center text-[9px] text-gray-600 mt-1">Brighter = more posts</div>
    </div>
  );
}

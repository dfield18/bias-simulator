"use client";

import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { RawFeedItem } from "@/lib/api";

type YAxisMode = "volume" | "reach";

interface SentimentDistributionProps {
  items: RawFeedItem[];
  antiLabel: string;
  proLabel: string;
  bias: number;
  onChange: (value: number) => void;
  hideTitle?: boolean;
}

function buildDistribution(items: RawFeedItem[], mode: YAxisMode = "volume"): number[] {
  const raw = new Array(21).fill(0);

  for (const item of items) {
    const score = item.classification.effective_intensity_score;
    const bent = (item.classification.effective_political_bent || "unclear").toLowerCase();
    const weight = mode === "reach" ? Math.max(item.tweet.views || 0, 1) : 1;

    if (score != null) {
      const idx = Math.round(score + 10);
      if (idx >= 0 && idx <= 20) raw[idx] += weight;
    } else if (bent.includes("anti")) {
      const center = 6;
      const sigma = 1.8;
      let total = 0;
      const weights: number[] = [];
      for (let i = 0; i <= 9; i++) {
        const w = Math.exp(-((i - center) * (i - center)) / (2 * sigma * sigma));
        weights.push(w);
        total += w;
      }
      for (let i = 0; i <= 9; i++) {
        raw[i] += (weights[i] / total) * weight;
      }
    } else if (bent.includes("pro")) {
      const center = 14;
      const sigma = 1.8;
      let total = 0;
      const weights: number[] = [];
      for (let i = 11; i <= 20; i++) {
        const w = Math.exp(-((i - center) * (i - center)) / (2 * sigma * sigma));
        weights.push(w);
        total += w;
      }
      for (let i = 11; i <= 20; i++) {
        raw[i] += (weights[i - 11] / total) * weight;
      }
    } else if (bent === "neutral") {
      raw[10] += weight;
    }
  }

  const sigma = 1.0;
  const smoothed = new Array(21).fill(0);
  for (let i = 0; i <= 20; i++) {
    let sum = 0;
    let weightSum = 0;
    for (let j = 0; j <= 20; j++) {
      const dist = i - j;
      const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      sum += raw[j] * w;
      weightSum += w;
    }
    smoothed[i] = sum / weightSum;
  }

  return smoothed;
}

function getBiasLabel(value: number, antiLabel: string, proLabel: string): string {
  const abs = Math.abs(value);
  if (abs <= 1) return "all perspectives";
  const intensity =
    abs <= 3 ? "slightly" : abs <= 5 ? "moderately" : abs <= 7.5 ? "strongly" : "extremely";
  const side = value < 0 ? antiLabel.toLowerCase() : proLabel.toLowerCase();
  return `${intensity} ${side}`;
}

function getBiasColor(value: number): string {
  if (value < -1) return "rgb(59, 130, 246)";
  if (value > 1) return "rgb(239, 68, 68)";
  return "rgb(107, 114, 128)";
}

export default function SentimentDistribution({
  items,
  antiLabel,
  proLabel,
  bias,
  onChange,
  hideTitle = false,
}: SentimentDistributionProps) {
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("reach");
  const distribution = useMemo(() => buildDistribution(items, yAxisMode), [items, yAxisMode]);
  const maxVal = Math.max(...distribution, 1);
  const svgRef = useRef<SVGSVGElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Chart SVG dimensions — chart only, no labels
  const width = 600;
  const height = isMobile ? 170 : 160;
  const padX = 16;
  const padTop = isMobile ? 20 : 20;
  const padBottom = isMobile ? 14 : 10;
  const chartH = height - padTop - padBottom;
  const chartW = width - padX * 2;

  const strokeW = isMobile ? 2.5 : 2.5;
  const biasLineW = isMobile ? 2.5 : 1.5;
  const dotR = isMobile ? 7 : 5;
  const youFontSize = isMobile ? 11 : 9;
  const numFontSize = isMobile ? 13 : 10;

  // Convert clientX to bias value using SVG bounds
  const svgToValue = useCallback(
    (clientX: number) => {
      if (!svgRef.current) return 0;
      const rect = svgRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round((pct * 20 - 10) * 10) / 10;
    },
    []
  );

  // Convert clientX to bias value using slider bar bounds
  const sliderToValue = useCallback(
    (clientX: number) => {
      if (!sliderRef.current) return 0;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round((pct * 20 - 10) * 10) / 10;
    },
    []
  );

  // SVG drag handlers
  const handleSvgPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      onChange(svgToValue(e.clientX));
    },
    [svgToValue, onChange]
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(svgToValue(e.clientX));
    },
    [svgToValue, onChange]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Slider bar drag handlers
  const handleSliderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onChange(sliderToValue(e.clientX));
    },
    [sliderToValue, onChange]
  );

  const handleSliderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(sliderToValue(e.clientX));
    },
    [sliderToValue, onChange]
  );

  // Build the smooth curve path
  const points = distribution.map((val, i) => ({
    x: padX + (i / 20) * chartW,
    y: padTop + chartH - (val / maxVal) * chartH * 0.88,
  }));

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + (curr.x - prev.x) / 3;
    const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
    pathD += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillD =
    pathD +
    ` L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  const biasX = padX + ((bias + 10) / 20) * chartW;
  const centerX = padX + chartW / 2;
  const biasPct = ((bias + 10) / 20) * 100;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 pt-4 pb-3 sm:pb-4">
      {/* Title */}
      {!hideTitle && (
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-xs sm:text-sm text-gray-400 font-semibold">
              {yAxisMode === "volume" ? "Tweet Volume" : "Tweet Reach"} by Sentiment
            </div>
            <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
              Height = {yAxisMode === "volume" ? "number of tweets" : "total views"} at each intensity level. Slide to simulate bias.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={() => setYAxisMode("reach")}
              className={`px-2 py-0.5 rounded text-[10px] sm:text-xs transition-colors ${
                yAxisMode === "reach"
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              Reach
            </button>
            <button
              onClick={() => setYAxisMode("volume")}
              className={`px-2 py-0.5 rounded text-[10px] sm:text-xs transition-colors ${
                yAxisMode === "volume"
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              Volume
            </button>
          </div>
        </div>
      )}

      {/* SVG Chart — draggable */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-pointer select-none touch-none"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <linearGradient id="sentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.4" />
            <stop offset="45%" stopColor="rgb(107, 114, 128)" stopOpacity="0.15" />
            <stop offset="55%" stopColor="rgb(107, 114, 128)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="strokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.9" />
            <stop offset="45%" stopColor="rgb(156, 163, 175)" stopOpacity="0.5" />
            <stop offset="55%" stopColor="rgb(156, 163, 175)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={width} height={height} fill="transparent" />

        {/* Center line */}
        <line
          x1={centerX} y1={padTop} x2={centerX} y2={padTop + chartH}
          stroke="rgb(75, 85, 99)" strokeWidth="1" strokeDasharray="3,3"
        />

        {/* Filled area */}
        <path d={fillD} fill="url(#sentGradient)" />

        {/* Curve line */}
        <path d={pathD} fill="none" stroke="url(#strokeGradient)" strokeWidth={strokeW} />

        {/* Bias position indicator */}
        <line
          x1={biasX} y1={padTop} x2={biasX} y2={padTop + chartH}
          stroke="white" strokeWidth={biasLineW} strokeOpacity="0.8"
        />
        <circle
          cx={biasX} cy={padTop + 8} r={dotR}
          fill="white" fillOpacity="0.9" stroke="rgb(31, 41, 55)" strokeWidth={isMobile ? 2.5 : 2}
        />

        {/* X-axis number labels */}
        {(isMobile ? [-10, -5, 0, 5, 10] : [-5, 0, 5]).map((val) => {
          const x = padX + ((val + 10) / 20) * chartW;
          return (
            <text
              key={val} x={x} y={height - 2} textAnchor="middle"
              fill="rgb(107, 114, 128)" fontSize={numFontSize}
            >
              {val > 0 ? `+${val}` : val}
            </text>
          );
        })}
      </svg>

      {/* Labels row — outside SVG, padded to match chart area */}
      <div
        className="flex justify-between mt-1"
        style={{ marginLeft: `${(padX / width) * 100}%`, marginRight: `${(padX / width) * 100}%` }}
      >
        <span className="text-xs sm:text-sm font-semibold text-blue-400">{antiLabel}</span>
        <span className="text-xs sm:text-sm font-semibold text-red-400">{proLabel}</span>
      </div>

      {/* Slider bar — draggable, below the chart, padded to match SVG chart area */}
      <div
        ref={sliderRef}
        className="relative h-8 sm:h-6 mt-2 cursor-pointer select-none touch-none"
        style={{ marginLeft: `${(padX / width) * 100}%`, marginRight: `${(padX / width) * 100}%` }}
        onPointerDown={handleSliderPointerDown}
        onPointerMove={handleSliderPointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Gradient track: blue → red */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 sm:h-1.5 rounded-full"
          style={{
            background: "linear-gradient(to right, rgb(59, 130, 246), rgb(107, 114, 128) 45%, rgb(107, 114, 128) 55%, rgb(239, 68, 68))",
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-lg"
          style={{
            left: `${biasPct}%`,
            backgroundColor: getBiasColor(bias),
          }}
        />
      </div>

      {/* Bias label — below slider */}
      <div className="text-center mt-1">
        <span className="text-xs sm:text-sm font-medium" style={{ color: getBiasColor(bias) }}>
          {getBiasLabel(bias, antiLabel, proLabel)}
        </span>
        <span className="text-[10px] sm:text-xs text-gray-500 ml-1.5">
          ({bias > 0 ? "+" : ""}{bias.toFixed(1)})
        </span>
      </div>
    </div>
  );
}

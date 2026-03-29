"use client";

import { useCallback, useRef } from "react";

interface BiasSliderProps {
  value: number;
  onChange: (value: number) => void;
  onChangeEnd: (value: number) => void;
  antiLabel: string;
  proLabel: string;
}

function getBiasLabel(value: number, antiLabel: string, proLabel: string): string {
  const abs = Math.abs(value);
  if (abs <= 1) return "Neutral";
  const intensity =
    abs <= 3 ? "Slightly" : abs <= 5 ? "Moderately" : abs <= 7.5 ? "Strongly" : "Extremely";
  const side = value < 0 ? antiLabel : proLabel;
  return `${intensity} ${side}`;
}

function getTrackColor(value: number): string {
  if (value < -1) return "rgb(59, 130, 246)";  // left = blue (liberal)
  if (value > 1) return "rgb(239, 68, 68)";    // right = red (conservative)
  return "rgb(107, 114, 128)";
}

export default function BiasSlider({
  value,
  onChange,
  onChangeEnd,
  antiLabel,
  proLabel,
}: BiasSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const valueToPercent = (v: number) => ((v + 10) / 20) * 100;

  const percentToValue = (pct: number) => {
    const raw = (pct / 100) * 20 - 10;
    return Math.round(raw * 10) / 10; // round to 1 decimal
  };

  const getValueFromEvent = useCallback(
    (clientX: number) => {
      if (!sliderRef.current) return 0;
      const rect = sliderRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      return percentToValue(pct);
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const v = getValueFromEvent(e.clientX);
      onChange(v);
    },
    [getValueFromEvent, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const v = getValueFromEvent(e.clientX);
      onChange(v);
    },
    [getValueFromEvent, onChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const v = getValueFromEvent(e.clientX);
      onChangeEnd(v);
    },
    [getValueFromEvent, onChangeEnd]
  );

  const thumbPct = valueToPercent(value);
  const fillColor = getTrackColor(value);
  const label = getBiasLabel(value, antiLabel, proLabel);

  // Fill from center (50%) to thumb position
  const fillLeft = value < 0 ? thumbPct : 50;
  const fillWidth = value < 0 ? 50 - thumbPct : thumbPct - 50;

  return (
    <div className="w-full max-w-md">
      {/* Label */}
      <div className="text-center mb-2">
        <span
          className="text-sm font-medium"
          style={{ color: fillColor }}
        >
          {label}
        </span>
        <span className="text-xs text-gray-500 ml-2">
          ({value > 0 ? "+" : ""}
          {value.toFixed(1)})
        </span>
      </div>

      {/* Slider track */}
      <div
        ref={sliderRef}
        className="relative h-12 sm:h-8 cursor-pointer select-none touch-none"
        tabIndex={0}
        role="slider"
        aria-valuenow={value}
        aria-valuemin={-10}
        aria-valuemax={10}
        aria-label="Bias slider"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1.0 : 0.5;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            const v = Math.max(-10, Math.round((value - step) * 10) / 10);
            onChange(v);
            onChangeEnd(v);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            const v = Math.min(10, Math.round((value + step) * 10) / 10);
            onChange(v);
            onChangeEnd(v);
          }
        }}
      >
        {/* Background track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-3 sm:h-2 bg-gray-800 rounded-full" />

        {/* Colored fill from center */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3 sm:h-2 rounded-full transition-colors"
          style={{
            left: `${fillLeft}%`,
            width: `${fillWidth}%`,
            backgroundColor: fillColor,
            opacity: 0.7,
          }}
        />

        {/* Center tick */}
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-gray-600 rounded" />

        {/* Tick marks */}
        {[-10, -5, 0, 5, 10].map((tick) => (
          <div
            key={tick}
            className="absolute top-1/2 translate-y-2 text-[10px] text-gray-600 -translate-x-1/2"
            style={{ left: `${valueToPercent(tick)}%` }}
          >
            {tick > 0 ? `+${tick}` : tick}
          </div>
        ))}

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 sm:w-5 sm:h-5 rounded-full border-2 border-white shadow-lg transition-colors"
          style={{
            left: `${thumbPct}%`,
            backgroundColor: fillColor,
          }}
        />
      </div>

      {/* Endpoint labels */}
      <div className="flex justify-between mt-4 text-xs">
        <span className="text-blue-400">{antiLabel}</span>
        <span className="text-gray-500">Neutral</span>
        <span className="text-red-400">{proLabel}</span>
      </div>
    </div>
  );
}

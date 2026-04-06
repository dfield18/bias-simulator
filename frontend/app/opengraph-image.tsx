import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "DividedView — See How Political Bias Shapes Your Feed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a1a 0%, #111827 50%, #0a0a1a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Left accent */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
          }}
        />
        {/* Right accent */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 8,
            background: "linear-gradient(180deg, #ef4444, #b91c1c)",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#f3f4f6",
            letterSpacing: "-0.02em",
            marginBottom: 24,
            display: "flex",
          }}
        >
          DividedView
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: "#9ca3af",
            maxWidth: 800,
            textAlign: "center",
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          See How Political Bias Shapes Your Feed
        </div>

        {/* Labels row */}
        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 48,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              color: "#60a5fa",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 22,
              fontWeight: 600,
              display: "flex",
            }}
          >
            Left Perspective
          </div>
          <div
            style={{
              color: "#6b7280",
              fontSize: 28,
              display: "flex",
            }}
          >
            vs
          </div>
          <div
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              color: "#f87171",
              padding: "12px 28px",
              borderRadius: 12,
              fontSize: 22,
              fontWeight: 600,
              display: "flex",
            }}
          >
            Right Perspective
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            color: "#4b5563",
            fontSize: 18,
            display: "flex",
          }}
        >
          dividedview.com — AI-powered political bias analysis
        </div>
      </div>
    ),
    { ...size }
  );
}

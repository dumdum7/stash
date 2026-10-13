import React, { useEffect, useMemo, useRef, useState } from "react";

export interface IHistoryBucket {
  key: string;
  // short label used on the x axis
  axisLabel: string;
  // full label used in the tooltip
  label: string;
  value: number;
}

interface IHistoryBarChartProps {
  buckets: IHistoryBucket[];
  color: string;
  ariaLabel: string;
  formatValue: (v: number) => string;
}

const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 26, left: 40 };
const MIN_LABEL_SPACING = 72;

// returns a "nice" step size so that the axis has roughly `count` ticks
function niceStep(max: number, count: number) {
  const raw = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  let nice = 10;
  if (residual <= 1) nice = 1;
  else if (residual <= 2) nice = 2;
  else if (residual <= 5) nice = 5;
  // values are counts, so never step by less than 1
  return Math.max(1, nice * magnitude);
}

// bar with rounded top corners, anchored square to the baseline
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

export const HistoryBarChart: React.FC<IHistoryBarChartProps> = ({
  buckets,
  color,
  ariaLabel,
  formatValue,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number>();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { yMax, ticks } = useMemo(() => {
    const max = Math.max(0, ...buckets.map((b) => b.value));
    if (max === 0) return { yMax: 1, ticks: [0, 1] };

    const step = niceStep(max, 4);
    const top = Math.ceil(max / step) * step;
    const t: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) {
      t.push(v);
    }
    return { yMax: top, ticks: t };
  }, [buckets]);

  const band = buckets.length > 0 ? plotWidth / buckets.length : 0;
  const gap = band >= 6 ? 2 : band >= 3 ? 1 : 0;
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SPACING / (band || 1)));

  const y = (v: number) => plotHeight - (v / yMax) * plotHeight;

  const hoveredBucket = hovered !== undefined ? buckets[hovered] : undefined;

  function renderTooltip() {
    if (!hoveredBucket || hovered === undefined) return;

    const center = MARGIN.left + band * hovered + band / 2;
    // keep the tooltip inside the chart
    const flip = center > width - 140;

    return (
      <div
        className="history-chart-tooltip"
        style={{
          left: flip ? undefined : center + 8,
          right: flip ? width - center + 8 : undefined,
          top: MARGIN.top,
        }}
      >
        <div className="history-chart-tooltip-label">{hoveredBucket.label}</div>
        <div className="history-chart-tooltip-value">
          <span
            className="history-chart-swatch"
            style={{ backgroundColor: color }}
          />
          {formatValue(hoveredBucket.value)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="history-chart"
      ref={containerRef}
      onMouseLeave={() => setHovered(undefined)}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line
                  className={
                    t === 0 ? "history-chart-baseline" : "history-chart-grid"
                  }
                  x1={0}
                  x2={plotWidth}
                />
                <text
                  className="history-chart-axis-label"
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                >
                  {t}
                </text>
              </g>
            ))}

            {hovered !== undefined && (
              <rect
                className="history-chart-hover"
                x={band * hovered}
                y={0}
                width={band}
                height={plotHeight}
              />
            )}

            {buckets.map((b, i) => {
              if (b.value <= 0) return null;
              const h = plotHeight - y(b.value);
              return (
                <path
                  key={b.key}
                  d={barPath(
                    band * i + gap / 2,
                    y(b.value),
                    Math.max(1, band - gap),
                    h
                  )}
                  fill={color}
                />
              );
            })}

            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={b.key}
                  className="history-chart-axis-label"
                  x={band * i + band / 2}
                  y={plotHeight + 18}
                  textAnchor={i === 0 && band < 30 ? "start" : "middle"}
                >
                  {b.axisLabel}
                </text>
              ) : null
            )}

            {/* hit targets span the full column so thin bars are easy to hover */}
            {buckets.map((b, i) => (
              <rect
                key={b.key}
                x={band * i}
                y={0}
                width={band}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onTouchStart={() => setHovered(i)}
              />
            ))}
          </g>
        </svg>
      )}
      {renderTooltip()}
    </div>
  );
};

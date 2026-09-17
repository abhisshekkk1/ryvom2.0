"use client";

import React, { useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Download, TrendingUp, Plus } from "lucide-react";
import { formatNum } from "@/lib/progressAnalytics";

export interface ChartDataPoint {
  date: string;
  formattedDate?: string;
  value: number | null;
  avgValue?: number | null;
  target?: number | null;
}

interface InteractiveChartProps {
  title: string;
  subtitle?: string;
  clientName?: string;
  data: ChartDataPoint[];
  unit: string;
  color?: string;
  avgColor?: string;
  targetValue?: number | null;
  showAverage?: boolean;
  minDomain?: number | "auto";
  maxDomain?: number | "auto";
  emptyMessage?: string;
  onActionClick?: () => void;
  actionLabel?: string;
}

export default function InteractiveChart({
  title,
  subtitle,
  clientName = "Client",
  data,
  unit,
  color = "#f59e0b", // RYVOM amber
  avgColor = "#10b981", // emerald
  targetValue = null,
  showAverage = false,
  minDomain = "auto",
  maxDomain = "auto",
  emptyMessage = "No records logged in this period.",
  onActionClick,
  actionLabel,
}: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Filter valid data points
  const validData = data.filter(
    (d) => d.value !== null && d.value !== undefined && !isNaN(d.value)
  );

  // Function to export SVG of the chart
  const handleExport = () => {
    if (!chartContainerRef.current) return;
    const svgElement = chartContainerRef.current.querySelector("svg");
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RYVOM_${clientName.replace(/\s+/g, "_")}_${title.replace(/\s+/g, "_")}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── COMPACT EMPTY STATE (Fix for blank boxes) ───
  if (validData.length === 0) {
    return (
      <div className="bg-zinc-900/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between h-[180px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: color }}
              />
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                {title}
              </h4>
            </div>
            {subtitle && (
              <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            No Data
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center my-auto py-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800/70 border border-zinc-750 flex items-center justify-center text-zinc-500 mb-1.5">
            <TrendingUp className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-xs text-zinc-400 font-medium">{emptyMessage}</p>
          <span className="text-[11px] text-zinc-600 mt-0.5">
            Try choosing a longer date range or logging a new entry
          </span>
        </div>

        {onActionClick && actionLabel ? (
          <div className="pt-2 border-t border-zinc-800/60 flex justify-end">
            <button
              onClick={onActionClick}
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {actionLabel}
            </button>
          </div>
        ) : (
          <div className="h-1" />
        )}
      </div>
    );
  }

  // ─── ACTIVE CHART LAYOUT ───
  const values = validData.map((d) => d.value as number);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin =
    minDomain === "auto"
      ? Math.max(0, Math.floor(dataMin - (dataMin * 0.05 || 2)))
      : minDomain;
  const yMax =
    maxDomain === "auto"
      ? Math.ceil(dataMax + (dataMax * 0.05 || 2))
      : maxDomain;

  const latestVal = validData[validData.length - 1]?.value;

  return (
    <div
      ref={chartContainerRef}
      className="bg-zinc-900/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between transition-all hover:border-zinc-700/80 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              {title}
            </h4>
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5">
            {subtitle ? <span>{subtitle} &bull;</span> : null}
            <span>
              Latest: <strong className="text-white font-semibold">{formatNum(latestVal, 1, "", ` ${unit}`)}</strong>
            </span>
            <span className="text-zinc-500">
              ({validData.length} {validData.length === 1 ? "entry" : "entries"})
            </span>
          </div>
        </div>

        <button
          onClick={handleExport}
          title="Download Chart (SVG)"
          aria-label={`Export ${title} chart`}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-48 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={validData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid stroke="#222226" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="formattedDate"
              stroke="#71717a"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              stroke="#71717a"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#27272a" }}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#09090b",
                borderColor: "#27272a",
                borderRadius: "0.75rem",
                fontSize: "12px",
                color: "#fafafa",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              }}
              labelStyle={{ color: "#a1a1aa", marginBottom: "4px", fontSize: "11px" }}
              formatter={(value: unknown) => [
                `${formatNum(Number(value), 1, "", ` ${unit}`)}`,
                title,
              ]}
            />
            {targetValue !== null && targetValue !== undefined && (
              <ReferenceLine
                y={targetValue}
                label={{
                  value: `Goal: ${targetValue}${unit}`,
                  fill: "#a1a1aa",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
                stroke="#a1a1aa"
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name={title}
              stroke={color}
              strokeWidth={2}
              connectNulls={false}
              dot={{ fill: color, r: 3, strokeWidth: 1, stroke: "#09090b" }}
              activeDot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
            />
            {showAverage && (
              <Line
                type="monotone"
                dataKey="avgValue"
                name="Weekly Average"
                stroke={avgColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                connectNulls={false}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

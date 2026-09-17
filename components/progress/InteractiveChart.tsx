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
import { Download, TrendingUp } from "lucide-react";
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
}

export default function InteractiveChart({
  title,
  clientName = "Client",
  data,
  unit,
  color = "#f59e0b", // amber
  avgColor = "#10b981", // emerald
  targetValue = null,
  showAverage = false,
  minDomain = "auto",
  maxDomain = "auto",
  emptyMessage = "No data recorded for this metric yet.",
}: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Filter valid data points
  const validData = data.filter(
    (d) => d.value !== null && d.value !== undefined && !isNaN(d.value)
  );

  if (validData.length === 0) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800/80 p-5 rounded-xl flex flex-col items-center justify-center min-h-[220px] text-center">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 mb-2">
          <TrendingUp className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-zinc-300">{title}</h4>
        <p className="text-xs text-zinc-500 max-w-xs mt-1">{emptyMessage}</p>
      </div>
    );
  }

  // Find min/max for safe Y-axis domain
  const values = validData.map((d) => d.value as number);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = minDomain === "auto" ? Math.max(0, Math.floor(dataMin - (dataMin * 0.05 || 2))) : minDomain;
  const yMax = maxDomain === "auto" ? Math.ceil(dataMax + (dataMax * 0.05 || 2)) : maxDomain;

  // Function to export SVG / PNG of the chart
  const handleExport = () => {
    if (!chartContainerRef.current) return;
    const svgElement = chartContainerRef.current.querySelector("svg");
    if (!svgElement) return;

    // Clone SVG to add metadata/branding
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

  return (
    <div
      ref={chartContainerRef}
      className="bg-zinc-900/90 border border-zinc-800/80 p-4 rounded-xl flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            {title}
          </h4>
          <span className="text-[11px] text-zinc-400">
            Latest: <strong className="text-white">{formatNum(validData[validData.length - 1]?.value, 1, "", ` ${unit}`)}</strong>
            {validData.length > 1 && (
              <span className="ml-2 text-zinc-400">
                ({validData.length} entries recorded)
              </span>
            )}
          </span>
        </div>

        <button
          onClick={handleExport}
          title="Download Chart (SVG)"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={validData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="formattedDate"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#3f3f46" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#3f3f46" }}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "#3f3f46",
                borderRadius: "0.5rem",
                fontSize: "12px",
                color: "#fafafa",
              }}
              labelStyle={{ color: "#a1a1aa", marginBottom: "4px" }}
              formatter={(value: unknown) => [
                `${formatNum(Number(value), 1, "", ` ${unit}`)}`,
                title,
              ]}
            />
            {targetValue !== null && targetValue !== undefined && (
              <ReferenceLine
                y={targetValue}
                label={{
                  value: `Target: ${targetValue}${unit}`,
                  fill: "#a1a1aa",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
                stroke="#6366f1"
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name={title}
              stroke={color}
              strokeWidth={2.5}
              connectNulls={false}
              dot={{ fill: color, r: 4, strokeWidth: 1, stroke: "#18181b" }}
              activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
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

"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { useTimezone } from "@/components/providers/timezone";
import { formatDateTime, formatValue } from "@/lib/format";
import { cssVar, SERIES_VARS } from "./colors";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" /> });

export interface ChartLine {
  id: string;
  name: string;
  colorSlot: number;
  points: [number, number | null][];
}

export function TimeseriesChart({
  lines,
  unit,
  kind,
  decimals = 1,
  height = 320,
  yLabel,
  start,
  end,
}: {
  lines: ChartLine[];
  unit: string;
  kind: string;
  decimals?: number;
  height?: number;
  yLabel?: string;
  start?: string;
  end?: string;
}) {
  const tz = useTimezone();
  const { resolvedTheme } = useTheme();

  const option = useMemo(() => {
    const text2 = cssVar("--text-2");
    const text3 = cssVar("--text-3");
    const grid = cssVar("--grid");
    const surface = cssVar("--surface");
    const border = cssVar("--border-strong");
    const isDirection = kind === "direction";
    const isTotal = kind === "interval_total";
    const span = (() => {
      const xs = lines.flatMap((l) => l.points.map((p) => p[0]));
      return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    })();
    const axisPattern = span > 3 * 86_400_000 ? "d MMM" : span > 86_400_000 ? "d MMM HH:mm" : "HH:mm";
    return {
      animation: false,
      aria: { enabled: true, decal: { show: false } },
      backgroundColor: "transparent",
      grid: { left: 8, right: 16, top: lines.length > 1 ? 64 : 36, bottom: 56, containLabel: true },
      legend: lines.length > 1 ? { top: 0, left: 0, type: "scroll", icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: text2, fontSize: 11 } } : undefined,
      tooltip: {
        trigger: "axis",
        renderMode: "richText",
        confine: true,
        axisPointer: { type: "line", lineStyle: { color: border } },
        backgroundColor: surface,
        borderColor: border,
        textStyle: { color: cssVar("--text"), fontSize: 12 },
        formatter: (params: { seriesName: string; value: [number, number | null]; color: string }[]) => {
          if (!params.length) return "";
          const t = params[0].value[0];
          const rows = params
            .filter((p) => p.value[1] !== null && p.value[1] !== undefined)
            .map((p) => `${p.seriesName.replace(/[{}]/g, "")}   ${formatValue(p.value[1], decimals)} ${unit}`)
            .join("\n");
          return `${formatDateTime(t, tz, "d MMM yyyy, HH:mm")}\n${rows || "No data"}`;
        },
      },
      xAxis: {
        type: "time",
        min: start ? Date.parse(start) : undefined,
        max: end ? Date.parse(end) : undefined,
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: text3, fontSize: 11, hideOverlap: true, formatter: (v: number) => formatDateTime(v, tz, axisPattern) },
      },
      yAxis: {
        type: "value",
        name: yLabel ?? unit,
        nameTextStyle: { color: text3, fontSize: 11, align: "left" },
        scale: !isTotal,
        min: isDirection ? 0 : undefined,
        max: isDirection ? 360 : undefined,
        interval: isDirection ? 90 : undefined,
        splitLine: { lineStyle: { color: grid } },
        axisLabel: { color: text3, fontSize: 11, formatter: (v: number) => formatValue(v, Math.min(decimals, 2)) },
      },
      dataZoom: [
        { type: "inside", filterMode: "none" },
        { type: "slider", height: 18, bottom: 8, borderColor: grid, fillerColor: "rgba(34,195,214,0.12)", handleStyle: { color: text3 }, textStyle: { color: text3, fontSize: 10 }, labelFormatter: (v: number) => formatDateTime(v, tz, "d MMM HH:mm"), dataBackground: { lineStyle: { color: border }, areaStyle: { color: grid } } },
      ],
      series: lines.map((l) => {
        const color = cssVar(SERIES_VARS[l.colorSlot] ?? SERIES_VARS[0]);
        if (isDirection) return { name: l.name, type: "scatter", symbolSize: 4, itemStyle: { color }, data: l.points.filter((p) => p[1] !== null) };
        if (isTotal) return { name: l.name, type: "bar", barMaxWidth: 10, itemStyle: { color, borderRadius: [3, 3, 0, 0] }, data: l.points };
        return { name: l.name, type: "line", showSymbol: false, symbolSize: 6, connectNulls: false, lineStyle: { width: 2, color }, itemStyle: { color }, emphasis: { focus: "series" }, data: l.points };
      }),
    };
    // resolvedTheme is a dependency so CSS-variable colours are re-read on theme change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, unit, kind, decimals, tz, resolvedTheme, yLabel, start, end]);

  return (
    <div style={{ height }} className="w-full min-w-0 overflow-hidden">
      <ReactECharts option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
    </div>
  );
}

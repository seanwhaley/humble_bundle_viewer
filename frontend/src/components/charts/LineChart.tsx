/**
 * Simple line chart wrapper for ECharts.
 */
import ReactECharts from "echarts-for-react";
import { echarts } from "./echarts";

interface ChartDataPoint {
  id?: string;
  label: string;
  value: number;
  details?: string;
}

interface LineChartProps {
  title: string;
  data: ChartDataPoint[];
  emptyMessage?: string;
  valueLabel?: string;
  tooltipFormatter?: (point: {
    label: string;
    value: number;
    details?: string;
  }) => string;
}

/**
 * Line chart component for ordered distributions and timelines.
 */
export default function LineChart({
  title,
  data,
  emptyMessage = "No chart data available.",
  valueLabel = "Count",
  tooltipFormatter,
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-2 text-xs uppercase text-slate-400">{title}</div>
        <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      </div>
    );
  }

  const option = {
    tooltip: {
      trigger: "axis",
      formatter: (params: any[]) => {
        const datum = params?.[0]?.data;
        const point = {
          label: String(datum?.name ?? params?.[0]?.axisValue ?? ""),
          value: Number(datum?.value ?? 0),
          details: datum?.details as string | undefined,
        };

        if (tooltipFormatter) {
          return tooltipFormatter(point);
        }

        return `${point.label}: ${point.value}`;
      },
    },
    grid: { left: 24, right: 20, top: 30, bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: data.map((item) => item.label),
      boundaryGap: false,
      axisLabel: {
        color: "#94a3b8",
      },
    },
    yAxis: {
      type: "value",
      name: valueLabel,
      nameTextStyle: {
        color: "#64748b",
      },
      axisLabel: {
        color: "#94a3b8",
      },
      splitLine: {
        lineStyle: {
          color: "rgba(148, 163, 184, 0.12)",
        },
      },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: {
          width: 3,
          color: "#818cf8",
        },
        itemStyle: {
          color: "#38bdf8",
          borderColor: "#020617",
          borderWidth: 2,
        },
        areaStyle: {
          color: "rgba(99, 102, 241, 0.18)",
        },
        data: data.map((item) => ({
          value: item.value,
          id: item.id,
          name: item.label,
          details: item.details,
        })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-2 text-xs uppercase text-slate-400">{title}</div>
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        style={{ height: 240 }}
      />
    </div>
  );
}

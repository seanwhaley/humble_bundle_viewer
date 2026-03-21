/**
 * Donut-style pie chart wrapper for ECharts.
 */
import ReactECharts from "echarts-for-react";
import { echarts } from "./echarts";

interface ChartDataPoint {
  id?: string;
  label: string;
  value: number;
  details?: string;
}

interface PieChartProps {
  title: string;
  data: ChartDataPoint[];
  selected?: string | null;
  onSelect?: (value: string) => void;
  emptyMessage?: string;
  labelFormatter?: (point: {
    label: string;
    value: number;
    percent: number;
    details?: string;
  }) => string;
  tooltipFormatter?: (point: {
    label: string;
    value: number;
    percent: number;
    details?: string;
  }) => string;
}

/**
 * Pie chart component with optional click selection.
 */
export default function PieChart({
  title,
  data,
  selected,
  onSelect,
  emptyMessage = "No chart data available.",
  labelFormatter,
  tooltipFormatter,
}: PieChartProps) {
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
      trigger: "item",
      formatter: (params: any) => {
        const point = {
          label: String(params.name ?? ""),
          value: Number(params.value ?? 0),
          percent: Number(params.percent ?? 0),
          details: params.data?.details as string | undefined,
        };

        if (tooltipFormatter) {
          return tooltipFormatter(point);
        }

        return `${point.label}: ${point.value}`;
      },
    },
    series: [
      {
        name: title,
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: "#020617", // slate-950
          borderWidth: 2,
        },
        label: {
          show: true,
          position: "outside",
          formatter: (params: any) => {
            const point = {
              label: String(params.name ?? ""),
              value: Number(params.value ?? 0),
              percent: Number(params.percent ?? 0),
              details: params.data?.details as string | undefined,
            };

            if (labelFormatter) {
              return labelFormatter(point);
            }

            return `${point.label}: ${point.value}`;
          },
          color: "#94a3b8", // slate-400
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        labelLine: {
          show: true,
        },
        data: data.map((item) => ({
          value: item.value,
          name: item.label,
          metaId: item.id,
          details: item.details,
          itemStyle:
            selected && (item.id || item.label) === selected ?
              { color: "#38bdf8" } // Sky blue for selected
            : undefined,
        })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-xs uppercase text-slate-400 mb-2">{title}</div>
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        style={{ height: 240 }}
        onEvents={
          onSelect ?
            {
              click: (params: any) =>
                onSelect(params.data?.metaId || params.name),
            }
          : undefined
        }
      />
    </div>
  );
}

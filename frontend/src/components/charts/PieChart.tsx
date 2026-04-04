/**
 * Donut-style pie chart wrapper for ECharts.
 */
import ReactECharts from "echarts-for-react";
import ChartFrame from "./ChartFrame";
import { echarts } from "./echarts";
import { getChartTheme } from "./theme";

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
  const theme = getChartTheme();

  if (data.length === 0) {
    return <ChartFrame title={title} emptyMessage={emptyMessage} />;
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
          borderColor: theme.surface,
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
          color: theme.mutedForeground,
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
              { color: theme.accent }
            : undefined,
        })),
      },
    ],
  };

  return (
    <ChartFrame title={title}>
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        className="h-[240px]"
        onEvents={
          onSelect ?
            {
              click: (params: any) =>
                onSelect(params.data?.metaId || params.name),
            }
          : undefined
        }
      />
    </ChartFrame>
  );
}

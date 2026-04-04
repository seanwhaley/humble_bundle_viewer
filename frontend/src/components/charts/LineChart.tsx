/**
 * Simple line chart wrapper for ECharts.
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
  const theme = getChartTheme();

  if (data.length === 0) {
    return <ChartFrame title={title} emptyMessage={emptyMessage} />;
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
        color: theme.mutedForeground,
      },
    },
    yAxis: {
      type: "value",
      name: valueLabel,
      nameTextStyle: {
        color: theme.mutedForeground,
      },
      axisLabel: {
        color: theme.mutedForeground,
      },
      splitLine: {
        lineStyle: {
          color: theme.borderSoft,
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
          color: theme.accent,
        },
        itemStyle: {
          color: theme.infoForeground,
          borderColor: theme.surface,
          borderWidth: 2,
        },
        areaStyle: {
          color: theme.accentSoft,
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
    <ChartFrame title={title}>
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        className="h-[240px]"
      />
    </ChartFrame>
  );
}

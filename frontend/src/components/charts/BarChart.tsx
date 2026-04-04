/**
 * Simple bar chart wrapper for ECharts.
 */
import ReactECharts from "echarts-for-react";
import ChartFrame from "./ChartFrame";
import { echarts } from "./echarts";
import { getChartTheme } from "./theme";

interface ChartDataPoint {
  id?: string;
  label: string;
  value: number;
  selectValue?: string | null;
}

interface BarChartProps {
  title: string;
  data: ChartDataPoint[];
  selected?: string | null;
  onSelect?: (value: string) => void;
}

/**
 * Bar chart component with optional click selection.
 */
export default function BarChart({
  title,
  data,
  selected,
  onSelect,
}: BarChartProps) {
  const theme = getChartTheme();

  const getSelectionValue = (item: ChartDataPoint) => {
    if (item.selectValue !== undefined) {
      return item.selectValue;
    }
    return item.id || item.label;
  };

  const option = {
    tooltip: { trigger: "axis" },
    grid: { left: 20, right: 20, top: 30, bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: data.map((item) => item.label),
      axisLabel: {
        rotate: 20,
        color: theme.mutedForeground,
      },
      axisLine: {
        lineStyle: {
          color: theme.border,
        },
      },
      axisTick: {
        lineStyle: {
          color: theme.border,
        },
      },
    },
    yAxis: {
      type: "value",
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
        type: "bar",
        data: data.map((item) => {
          const selectionValue = getSelectionValue(item);
          const isSelectable = Boolean(onSelect) && selectionValue !== null;

          return {
            value: item.value,
            id: item.id,
            name: item.label,
            selectValue: selectionValue,
            itemStyle:
              selected && selectionValue === selected ?
                { color: theme.accent }
              : undefined,
            emphasis: {
              disabled: !isSelectable,
            },
          };
        }),
      },
    ],
  };

  return (
    <ChartFrame title={title} titleClassName="mb-0">
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        className="h-[240px]"
        onEvents={
          onSelect ?
            {
              click: (params: any) => {
                const value = params.data?.selectValue;
                if (value === null || value === undefined || value === "") {
                  return;
                }
                onSelect(String(value));
              },
            }
          : undefined
        }
      />
    </ChartFrame>
  );
}

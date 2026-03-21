/**
 * Simple bar chart wrapper for ECharts.
 */
import ReactECharts from "echarts-for-react";
import { echarts } from "./echarts";

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
      axisLabel: { rotate: 20 },
    },
    yAxis: { type: "value" },
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
              selected && selectionValue === selected
                ? { color: "#38bdf8" }
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
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-xs uppercase text-slate-400">{title}</div>
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "svg" }}
        style={{ height: 240 }}
        onEvents={
          onSelect
            ? {
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
    </div>
  );
}

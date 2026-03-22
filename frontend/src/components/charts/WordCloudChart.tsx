/**
 * Word cloud wrapper for weighted keyword browsing.
 */
import ReactECharts from "echarts-for-react";

import { echarts } from "./echarts";

export interface WordCloudDatum {
  label: string;
  value: number;
}

interface WordCloudChartProps {
  title?: string;
  data: WordCloudDatum[];
  selected?: string | null;
  emptyMessage?: string;
  onSelect?: (value: string) => void;
}

const PALETTE = ["#e2e8f0", "#c4b5fd", "#93c5fd", "#67e8f9", "#f5d0fe"];

const hashLabel = (label: string) =>
  Array.from(label).reduce((hash, char) => hash + char.charCodeAt(0), 0);

/**
 * Render a weighted word/tag cloud with rotation and click selection.
 */
export default function WordCloudChart({
  title,
  data,
  selected,
  emptyMessage = "No themes available.",
  onSelect,
}: WordCloudChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const normalizedSelected = selected?.trim().toLowerCase() || "";

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (params: { name?: string; value?: number }) =>
        `${params.name || "Theme"}: ${params.value || 0} weighted matches`,
    },
    series: [
      {
        type: "wordCloud" as const,
        shape: "circle",
        left: "center",
        top: "center",
        width: "100%",
        height: "100%",
        sizeRange: [14, 44],
        rotationRange: [-90, 90],
        rotationStep: 45,
        gridSize: 10,
        drawOutOfBound: false,
        shrinkToFit: true,
        layoutAnimation: true,
        textStyle: {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontWeight: "bold",
        },
        emphasis: {
          focus: "self" as const,
          textStyle: {
            textShadowBlur: 10,
            textShadowColor: "rgba(15, 23, 42, 0.65)",
          },
        },
        data: data.map((item) => {
          const isSelected =
            normalizedSelected === item.label.trim().toLowerCase();
          const color =
            isSelected ? "#ffffff" : (
              PALETTE[hashLabel(item.label) % PALETTE.length]
            );

          return {
            name: item.label,
            value: item.value,
            textStyle: {
              color,
              fontWeight: isSelected ? 800 : 700,
            },
            emphasis: {
              textStyle: {
                color: "#ffffff",
              },
            },
          };
        }),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {title && <p className="text-sm font-medium text-slate-200">{title}</p>}
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "canvas" }}
        style={{ height: 320 }}
        onEvents={
          onSelect ?
            {
              click: (params: { name?: string }) => {
                if (!params.name) return;
                onSelect(params.name);
              },
            }
          : undefined
        }
      />
    </div>
  );
}

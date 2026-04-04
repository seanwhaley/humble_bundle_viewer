/**
 * Word cloud wrapper for weighted keyword browsing.
 */
import ReactECharts from "echarts-for-react";

import ChartFrame from "./ChartFrame";
import { echarts } from "./echarts";
import { getChartTheme } from "./theme";

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
  const theme = getChartTheme();
  const palette = [
    theme.warningForeground,
    theme.infoForeground,
    theme.successForeground,
    theme.mutedForeground,
    theme.foreground,
  ];

  if (data.length === 0) {
    return (
      <ChartFrame emptyMessage={emptyMessage} emptyHeightClassName="min-h-[80px]" />
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
            textShadowColor: theme.backdrop,
          },
        },
        data: data.map((item) => {
          const isSelected =
            normalizedSelected === item.label.trim().toLowerCase();
          const color =
            isSelected ? theme.accent : (
              palette[hashLabel(item.label) % palette.length]
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
                color: theme.foreground,
              },
            },
          };
        }),
      },
    ],
  };

  return (
    <ChartFrame
      title={title}
      titleClassName="text-sm font-medium uppercase normal-case tracking-normal text-card-foreground"
      className="bg-surface-soft">
      <ReactECharts
        echarts={echarts}
        option={option}
        opts={{ renderer: "canvas" }}
        className="h-[320px]"
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
    </ChartFrame>
  );
}

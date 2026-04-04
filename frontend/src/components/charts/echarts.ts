/**
 * Shared ECharts registry using modular imports for smaller bundles.
 */
import * as echarts from "echarts/core";
import { BarChart, PieChart, TreeChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import "echarts-wordcloud";

echarts.use([
  BarChart,
  PieChart,
  TreeChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
  SVGRenderer,
]);

export { echarts };

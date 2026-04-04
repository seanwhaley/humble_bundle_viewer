import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: { series: Array<{ data: unknown }> } }) => (
    <div data-testid="word-cloud-chart">
      {JSON.stringify(option.series[0].data)}
    </div>
  ),
}));

vi.mock("../../../src/components/charts/echarts", () => ({
  echarts: {},
}));

vi.mock("../../../src/components/charts/theme", () => ({
  getChartTheme: () => ({
    foreground: "foreground-color",
    warningForeground: "warning-color",
    infoForeground: "info-color",
    successForeground: "success-color",
    mutedForeground: "muted-color",
    accent: "accent-color",
    backdrop: "backdrop-color",
  }),
}));

import WordCloudChart from "../../../src/components/charts/WordCloudChart";

describe("WordCloudChart", () => {
  it("uses a distinct accent color for the selected word", () => {
    render(
      <WordCloudChart
        title="Themes"
        selected="Gamma"
        data={[
          { label: "Alpha", value: 3 },
          { label: "Gamma", value: 5 },
        ]}
      />,
    );

    const serializedData = screen.getByTestId("word-cloud-chart").textContent;

    expect(serializedData).toContain('"name":"Gamma"');
    expect(serializedData).toContain('"color":"accent-color"');
    expect(serializedData).not.toContain('"name":"Gamma","value":5,"textStyle":{"color":"foreground-color"');
  });
});
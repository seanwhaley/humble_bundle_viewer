import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock("../../src/App", () => ({
  default: () => null,
}));

vi.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }: { children: unknown }) => children,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: createRootMock,
  },
}));

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    renderMock.mockClear();
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("creates a React root and renders the application shell", async () => {
    await import("../../src/main");

    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});

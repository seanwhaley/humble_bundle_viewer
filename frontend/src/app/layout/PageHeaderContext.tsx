/**
 * Shared page-header action context for route-specific header controls.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PageHeaderContextValue = {
  actions: ReactNode | null;
  setActions: (next: ReactNode | null) => void;
};

const PageHeaderContext = createContext<PageHeaderContextValue | undefined>(
  undefined,
);

/**
 * Provider for route-owned page-header actions.
 */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode | null>(null);
  const value = useMemo(() => ({ actions, setActions }), [actions]);

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

/**
 * Access the current page-header actions state inside the layout shell.
 */
export function usePageHeaderState() {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error(
      "usePageHeaderState must be used inside PageHeaderProvider",
    );
  }

  return context;
}

/**
 * Register route-specific page-header actions while a page is mounted.
 */
export function usePageHeaderActions(actions: ReactNode | null) {
  const { setActions } = usePageHeaderState();

  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
}

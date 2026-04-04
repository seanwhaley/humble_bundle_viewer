/**
 * Reusable data table with sorting, filtering, and pagination.
 */
import type { InputHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  OnChangeFn,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ArrowUpDown, Filter } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  tableAutoLayoutClass,
  tableBaseClass,
  tableBodyCellClass,
  tableBodyRowClass,
  tableCellBaseClass,
  tableCheckboxClass,
  tableEmptyStateClass,
  tableFilterAnchorClass,
  tableFilterCountBadgeClass,
  tableFilterMenuClass,
  tableFilterMenuClearClass,
  tableFilterMenuHeaderClass,
  tableFilterMenuHintClass,
  tableFilterMenuSelectClass,
  tableFilterTriggerClass,
  tableFilterTriggerContentClass,
  tableFixedLayoutClass,
  tableFixedWrapperClass,
  tableHeaderBorderClass,
  tableHeaderCellClass,
  tableHeaderCellPaddingClass,
  tableHeaderContentClass,
  tableHeaderLabelRowClass,
  tableHeaderRowClass,
  tableHeaderSortableClass,
  tableHeaderStackClass,
  tableHeaderSurfaceClass,
  tableHeaderToggleClass,
  tableOverflowVisibleClass,
  tablePaginationButtonsClass,
  tablePaginationClass,
  tablePaginationControlsClass,
  tablePaginationInfoClass,
  tablePaginationSelectGroupClass,
  tableScrollWrapperClass,
  tableSelectionCellClass,
  tableSelectionHeaderCellClass,
  tableSelectionHeaderStackClass,
  tableSelectionSummaryClass,
  tableToolbarActionsClass,
  tableToolbarClass,
  tableToolbarRowClass,
  tableToolbarSearchSectionClass,
  tableToolbarSummaryClass,
} from "./ui/table";
import { cn } from "../lib/utils";
import {
  COMPACT_FORM_SELECT_CLASS,
  COMPACT_ACTION_BUTTON_CLASS,
  FILTER_PANEL_CLASS,
  FLOATING_PANEL_CLASS,
  TABLE_SHELL_CLASS,
} from "../styles/roles";

type TableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /**
   * Optional column name used by upstream callers (kept for compatibility).
   */
  searchKey?: string;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  /**
   * Controlled global filter value.
   */
  globalFilter?: string;
  /**
   * Controlled global filter change handler.
   */
  onGlobalFilterChange?: (value: string) => void;
  /**
   * Enable row selection with checkboxes.
   */
  enableRowSelection?: boolean;
  /**
   * Controlled row selection state.
   */
  rowSelection?: RowSelectionState;
  /**
   * Row selection change handler.
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /**
   * Provide a stable row id function for selection.
   */
  getRowId?: (row: TData, index: number) => string;
  /**
   * Whether the table should manage its own horizontal scrolling.
   */
  allowHorizontalScroll?: boolean;
}

interface IndeterminateCheckboxProps
  extends InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
}

const IndeterminateCheckbox = ({
  indeterminate,
  className,
  ...rest
}: IndeterminateCheckboxProps) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      type="checkbox"
      ref={ref}
      className={cn(tableCheckboxClass, className)}
      {...rest}
    />
  );
};

/**
 * Generic table wrapper built on TanStack Table.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter...",
  hideSearch = false,
  globalFilter: externalGlobalFilter,
  onGlobalFilterChange,
  enableRowSelection = false,
  rowSelection: externalRowSelection,
  onRowSelectionChange,
  getRowId,
  allowHorizontalScroll = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(
    null
  );
  const filterMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const globalFilter = externalGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilter = (value: string) => {
    if (onGlobalFilterChange) {
      onGlobalFilterChange(value);
      return;
    }
    setInternalGlobalFilter(value);
  };

  const rowSelection = externalRowSelection ?? internalRowSelection;
  const setRowSelection: OnChangeFn<RowSelectionState> =
    onRowSelectionChange ??
    ((updater) =>
      setInternalRowSelection((current) =>
        typeof updater === "function" ? updater(current) : updater
      ));

  useEffect(() => {
    if (!openFilterColumnId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const container = filterMenuRefs.current[openFilterColumnId];
      const target = event.target;
      if (container && target instanceof Node && !container.contains(target)) {
        setOpenFilterColumnId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFilterColumnId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openFilterColumnId]);

  // Tokens for normalized multi-select filtering.
  const BLANK_TOKEN = "__blank__";
  const REVEALED_TOKEN = "__revealed__";

  /**
   * Normalize a cell value into comparable tokens for filtering.
   */
  const normalizeValue = (value: unknown): string[] => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => normalizeValue(item));
    }
    if (value instanceof Date) return [value.toISOString()];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return [String(value)];
    }
    try {
      return [JSON.stringify(value)];
    } catch {
      return [String(value)];
    }
  };

  /**
   * Convert raw cell data into filter tokens, masking sensitive values.
   */
  const getRowTokens = (raw: unknown, filterKind?: string): string[] => {
    if (filterKind === "keyValue") {
      return raw ? [REVEALED_TOKEN] : [BLANK_TOKEN];
    }

    const values = normalizeValue(raw)
      .map((value) => String(value).trim())
      .filter((value) => value !== "");

    return values.length ? values : [BLANK_TOKEN];
  };

  // Build a lookup table from column id to custom filter behavior.
  const filterKindById = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (defs: ColumnDef<TData, TValue>[]) => {
      defs.forEach((def) => {
        const defAny = def as ColumnDef<TData, TValue> & {
          accessorKey?: unknown;
          columns?: ColumnDef<TData, TValue>[];
        };
        const id =
          def.id ??
          (typeof defAny.accessorKey === "string" ? defAny.accessorKey : undefined);
        const meta = def.meta as { filterKind?: string } | undefined;
        if (id && meta?.filterKind) {
          map.set(id, meta.filterKind);
        }
        if (defAny.columns) {
          walk(defAny.columns);
        }
      });
    };
    walk(columns);
    return map;
  }, [columns]);

  /**
   * Multi-select column filter that matches any selected token.
   */
  const multiSelectFilter: FilterFn<TData> = (row, columnId, filterValue) => {
    if (filterValue === undefined || filterValue === null || filterValue === "") {
      return true;
    }
    const selectedValues = Array.isArray(filterValue)
      ? filterValue.map((value) => String(value))
      : [String(filterValue)];
    if (!selectedValues.length) return true;

    const filterKind = filterKindById.get(columnId);
    const rowTokens = getRowTokens(row.getValue(columnId), filterKind);
    return rowTokens.some((value) => selectedValues.includes(value));
  };

  const selectionColumn: ColumnDef<TData, TValue> = {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <IndeterminateCheckbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={(event) => table.toggleAllRowsSelected(event.target.checked)}
          aria-label="Select all rows"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <IndeterminateCheckbox
          checked={row.getIsSelected()}
          indeterminate={row.getIsSomeSelected()}
          onChange={row.getToggleSelectedHandler()}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  };

  const tableColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn, ...columns] : columns),
    [enableRowSelection, columns]
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    defaultColumn: {
      filterFn: multiSelectFilter,
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      rowSelection,
    },
    onGlobalFilterChange: (updater) => {
      const nextValue =
        typeof updater === "function" ? updater(globalFilter) : updater;
      setGlobalFilter(String(nextValue ?? ""));
    },
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId,
  });

  const activeColumnFilters = columnFilters.filter(({ value }) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value) !== "";
  });
  const hasGlobalSearch = globalFilter.trim().length > 0;
  const showToolbar =
    !hideSearch ||
    enableRowSelection ||
    hasGlobalSearch ||
    activeColumnFilters.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const filteredCount = table.getFilteredRowModel().rows.length;

  const humanizeColumnId = (columnId: string) =>
    columnId
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (value) => value.toUpperCase());

  const getColumnLabel = (columnId: string) => {
    const column = table.getColumn(columnId);
    const header = column?.columnDef.header;
    if (typeof header === "string") {
      return header;
    }
    return humanizeColumnId(columnId);
  };

  const activeFilterSummaries = activeColumnFilters.map(({ id, value }) => {
    const count = Array.isArray(value) ? value.length : 1;
    return {
      id,
      label: getColumnLabel(id),
      count,
    };
  });

  const handleSelectAll = () => {
    const next: RowSelectionState = {};
    table.getFilteredRowModel().rows.forEach((row) => {
      next[row.id] = true;
    });
    table.setRowSelection(next);
  };

  const handleSelectNone = () => {
    table.setRowSelection({});
  };

  // Precompute option lists for each filterable column.
  const columnOptions = useMemo(() => {
    const rows = table.getPreFilteredRowModel().rows;
    const options: Record<string, string[]> = {};
    table.getAllLeafColumns().forEach((column) => {
      if (!column.getCanFilter()) return;
      const values = new Set<string>();
      const filterKind = filterKindById.get(column.id);
      rows.forEach((row) => {
        const raw = row.getValue(column.id);
        getRowTokens(raw, filterKind).forEach((value) => {
          values.add(value);
        });
      });
      options[column.id] = Array.from(values).sort((a, b) => {
        if (a === BLANK_TOKEN) return 1;
        if (b === BLANK_TOKEN) return -1;
        if (a === REVEALED_TOKEN) return -1;
        if (b === REVEALED_TOKEN) return 1;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });
    });
    return options;
  }, [table, data, filterKindById]);

  /**
   * Human-friendly label for filter dropdown entries.
   */
  const formatOptionLabel = (value: string, filterKind?: string) => {
    if (value === BLANK_TOKEN) return "Blank";
    if (filterKind === "keyValue" && value === REVEALED_TOKEN) return "Reviewed";
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed.length <= 40) return trimmed;
    return `${trimmed.slice(0, 37)}…`;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {showToolbar && (
        <div className={cn(FILTER_PANEL_CLASS, tableToolbarClass)}> 
          <div className={tableToolbarRowClass}>
            <div className={tableToolbarSearchSectionClass}>
              {!hideSearch && (
                <Input
                  placeholder={searchPlaceholder}
                  value={globalFilter}
                  onChange={(event) => setGlobalFilter(event.target.value)}
                  className="h-9 w-full max-w-lg"
                  aria-label="Search rows"
                />
              )}
              <div className={tableToolbarSummaryClass}>
                <Badge variant="neutral" size="compact" casing="ui">
                  Header filters available on this table
                </Badge>
                {hasGlobalSearch && (
                  <Badge variant="info" size="compact" casing="ui">
                    Search: {globalFilter}
                  </Badge>
                )}
                {activeFilterSummaries.map((filter) => (
                  <Badge
                    key={filter.id}
                    variant="info"
                    size="compact"
                    casing="ui"
                  >
                    {filter.label}: {filter.count}
                  </Badge>
                ))}
              </div>
            </div>
            <div className={tableToolbarActionsClass}>
              {hasGlobalSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={COMPACT_ACTION_BUTTON_CLASS}
                  onClick={() => setGlobalFilter("")}
                >
                  Clear search
                </Button>
              )}
              {activeFilterSummaries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={COMPACT_ACTION_BUTTON_CLASS}
                  onClick={() => table.resetColumnFilters()}
                >
                  Clear column filters
                </Button>
              )}
              {enableRowSelection && (
                <>
                  <span className={tableSelectionSummaryClass}>
                    Selected {selectedCount} of {filteredCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={COMPACT_ACTION_BUTTON_CLASS}
                    onClick={handleSelectAll}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={COMPACT_ACTION_BUTTON_CLASS}
                    onClick={handleSelectNone}
                  >
                    Select none
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(TABLE_SHELL_CLASS, tableOverflowVisibleClass)}
      >
        <div
          className={cn(
            allowHorizontalScroll
              ? tableScrollWrapperClass
              : tableFixedWrapperClass
          )}
        >
        <table
          className={cn(
            tableBaseClass,
            allowHorizontalScroll ? tableAutoLayoutClass : tableFixedLayoutClass
          )}
        >
            <thead className={cn(tableHeaderSurfaceClass, tableHeaderBorderClass)}>
                {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={tableHeaderRowClass}>
                    {headerGroup.headers.map((header) => {
                    const filterValue = header.column.getFilterValue();
                    const selectedCount = Array.isArray(filterValue)
                      ? filterValue.length
                      : filterValue
                        ? 1
                        : 0;
                    const isFilterOpen = openFilterColumnId === header.column.id;
                    const isSelectionColumn = header.column.id === "select";
                    const columnMeta =
                      header.column.columnDef.meta as TableColumnMeta | undefined;
                    return (
                        <th
                          key={header.id}
                          className={cn(
                            tableHeaderCellClass,
                            tableHeaderContentClass,
                            isSelectionColumn
                              ? tableSelectionHeaderCellClass
                              : tableHeaderCellPaddingClass,
                            columnMeta?.headerClassName
                          )}
                        >
                        {header.isPlaceholder ? null : (
                            <div
                                className={cn(
                                    isSelectionColumn
                                      ? tableSelectionHeaderStackClass
                                      : tableHeaderStackClass
                                )}
                            >
                                <div
                                  className={cn(
                                    tableHeaderToggleClass,
                                    isSelectionColumn
                                      ? "justify-center"
                                      : "justify-between",
                                    !isSelectionColumn &&
                                      header.column.getCanSort() &&
                                      tableHeaderSortableClass
                                  )}
                                  onClick={
                                    isSelectionColumn
                                      ? undefined
                                      : header.column.getToggleSortingHandler()
                                  }
                                >
                                  <div className={tableHeaderLabelRowClass}>
                                    <span>
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </span>
                                    {header.column.getCanSort() && !isSelectionColumn && (
                                        <ArrowUpDown className="h-3 w-3 shrink-0" />
                                    )}
                                  </div>
                                </div>
                                {!isSelectionColumn && header.column.getCanFilter() && (
                                  <div
                                    ref={(element) => {
                                      filterMenuRefs.current[header.column.id] = element;
                                    }}
                                    className={tableFilterAnchorClass}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className={tableFilterTriggerClass}
                                      title="Filter column (Ctrl/Cmd click to select multiple)"
                                      aria-haspopup="listbox"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenFilterColumnId((current) =>
                                          current === header.column.id
                                            ? null
                                            : header.column.id
                                        );
                                      }}
                                    >
                                      <div className={tableFilterTriggerContentClass}>
                                        <Filter className="h-3 w-3" />
                                        <span>Filter</span>
                                        {selectedCount > 0 && (
                                          <span className={tableFilterCountBadgeClass}>
                                            {selectedCount}
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                    {isFilterOpen && (
                                      <div className={cn(FLOATING_PANEL_CLASS, tableFilterMenuClass)}>
                                        <div className={tableFilterMenuHeaderClass}>
                                          <span>Filter</span>
                                          <button
                                            type="button"
                                            className={tableFilterMenuClearClass}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              header.column.setFilterValue(undefined);
                                            }}
                                          >
                                            Clear
                                          </button>
                                        </div>
                                        <select
                                          multiple
                                          title="Hold Ctrl (Cmd on Mac) to select multiple"
                                          className={cn(COMPACT_FORM_SELECT_CLASS, tableFilterMenuSelectClass)}
                                          value={(filterValue as string[]) ?? []}
                                          onChange={(event) => {
                                            const selected = Array.from(event.target.selectedOptions)
                                              .map((option) => option.value)
                                              .filter(Boolean);
                                            header.column.setFilterValue(
                                              selected.length ? selected : undefined
                                            );
                                          }}
                                        >
                                          {(
                                            columnOptions[header.column.id] ?? []
                                          ).map((option) => (
                                            <option key={option} value={option}>
                                              {formatOptionLabel(
                                                option,
                                                (header.column.columnDef.meta as { filterKind?: string } | undefined)
                                                  ?.filterKind
                                              )}
                                            </option>
                                          ))}
                                        </select>
                                        <p className={tableFilterMenuHintClass}>
                                          Hold Ctrl or Cmd to select multiple values.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                            </div>
                        )}
                        </th>
                    );
                    })}
                    </tr>
                ))}
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
                {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                    <tr
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  className={tableBodyRowClass}
                    >
                    {row.getVisibleCells().map((cell) => {
                        const isSelectionColumn = cell.column.id === "select";
                        const columnMeta = cell.column.columnDef.meta as TableColumnMeta | undefined;
                        return (
                        <td
                            key={cell.id}
                          className={cn(
                            tableCellBaseClass,
                            isSelectionColumn
                              ? tableSelectionCellClass
                              : tableBodyCellClass,
                            columnMeta?.cellClassName
                          )}
                            title={typeof cell.getValue() === 'string' ? String(cell.getValue()) : undefined}
                        >
                        {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                        )}
                        </td>
                    )})}
                    </tr>
                ))
                ) : (
                <tr>
                    <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className={tableEmptyStateClass}
                    >
                    No results.
                    </td>
                </tr>
                )}
            </tbody>
            </table>
        </div>
      </div>

      {/* Pagination */}
      <div className={tablePaginationClass}>
        <div className={tablePaginationInfoClass}>
          {table.getFilteredRowModel().rows.length} row(s) total.
        </div>
        <div className={tablePaginationControlsClass}>
          <div className={tablePaginationSelectGroupClass}>
            <span>Rows per page</span>
            <select
              className={COMPACT_FORM_SELECT_CLASS}
              aria-label="Rows per page"
              value={table.getState().pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className={tablePaginationSelectGroupClass}>
            <span>Page</span>
            <select
              className={COMPACT_FORM_SELECT_CLASS}
              aria-label="Page number"
              value={table.getState().pagination.pageIndex}
              onChange={(event) => table.setPageIndex(Number(event.target.value))}
            >
              {Array.from({ length: table.getPageCount() }, (_, index) => (
                <option key={index} value={index}>
                  {index + 1} of {table.getPageCount()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={tablePaginationButtonsClass}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

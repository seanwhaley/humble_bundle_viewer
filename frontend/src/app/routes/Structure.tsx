/**
 * Structure route for visualizing the normalized data model.
 */
import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Loader2, Code, Network } from "lucide-react";
import { Link } from "react-router-dom";
import { useLibraryData } from "../../data/api";
import { Button } from "../../components/ui/button";
import StatTile from "../../components/StatTile";
import { echarts } from "../../components/charts/echarts";

// Tree chart node used by the schema visualizer.
interface TreeNode {
  name: string;
  value?: string;
  children?: TreeNode[];
  collapsed?: boolean;
}

/**
 * JSON preview panel for sample payloads.
 */
const JsonBlock = ({ data, title }: { data: any; title: string }) => (
  <div className="rounded-xl border bg-slate-950/50 p-4 font-mono text-xs overflow-auto h-full shadow-inner">
    <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
      <span className="font-bold text-slate-400 uppercase tracking-wider">
        {title}
      </span>
      <span className="text-slate-600">
        {Array.isArray(data) ? `Array(${data.length})` : typeof data}
      </span>
    </div>
    <pre className="text-blue-200/90 whitespace-pre">
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

/**
 * Build a lightweight schema tree from a sample JSON object.
 */
const buildAggregateSchema = (data: any, name: string = "root"): TreeNode => {
  const traverse = (obj: any, keyName: string): TreeNode => {
    if (Array.isArray(obj)) {
      // Check if array of objects or primitives
      if (obj.length === 0) return { name: `${keyName}: []` };
      const first = obj[0];
      if (typeof first === "object" && first !== null) {
        // Sample the first item effectively for structure
        // Ideally we'd merge keys from multiple items, but first item is usually good enough for API schema
        return {
          name: `${keyName} [ ]`,
          children: Object.keys(first).map((k) => traverse(first[k], k)),
        };
      } else {
        return { name: `${keyName} [${typeof first}]` };
      }
    }

    if (typeof obj === "object" && obj !== null) {
      return {
        name: keyName,
        children: Object.keys(obj).map((k) => traverse(obj[k], k)),
      };
    }

    return { name: `${keyName} (${typeof obj})` };
  };

  return traverse(data, name);
};

/**
 * Schema inspector with tree and JSON views.
 */
export default function Structure() {
  const { data, isLoading, error } = useLibraryData();
  const [view, setView] = useState<"tree" | "json">("tree");
  const [sampleType, setSampleType] = useState<
    "product" | "subproduct" | "metadata"
  >("product");
  const [focus, setFocus] = useState<
    "all" | "products" | "subproducts" | "metadata"
  >("all");

  const subproductCount = useMemo(
    () =>
      data?.products?.reduce(
        (sum, product) => sum + (product.subproducts?.length || 0),
        0,
      ) || 0,
    [data],
  );

  const sampleProduct = data?.products?.[0] || {};
  const sampleSubproduct = sampleProduct?.subproducts?.[0] || {};
  const metadataSample = {
    total_products: data?.total_products ?? 0,
    captured_at: data?.captured_at ?? null,
    first_product_name:
      data?.products?.[0]?.human_name ||
      data?.products?.[0]?.product_name ||
      null,
  };

  const treeData = useMemo(() => {
    if (!data) return [];

    // We want to visualize the Structure of "LibraryData" (the root response)
    // The main components are 'products' and normalized subproducts.
    // We will build a manual top-level tree to guide the user, then attach automated schemas.

    // 1. Structure of a Product
    const productSchema = buildAggregateSchema(sampleProduct, "Product Schema");

    const subproductSchema = buildAggregateSchema(
      sampleSubproduct,
      "Subproduct Schema",
    );
    const metadataNode = {
      name: "Metadata",
      children: [
        { name: `total_products: ${data.total_products}` },
        { name: `captured_at: ${data.captured_at}` },
      ],
    };

    if (focus === "products") {
      return [
        {
          name: "Products List",
          value: `${data.products?.length || 0} items`,
          children: [productSchema],
          collapsed: false,
        },
      ];
    }

    if (focus === "subproducts") {
      return [
        {
          name: "Subproducts (nested)",
          value: `${subproductCount || 0} items`,
          children: [subproductSchema],
          collapsed: false,
        },
      ];
    }

    if (focus === "metadata") {
      return [metadataNode];
    }

    return [
      {
        name: "Library Data Root",
        children: [
          {
            name: "Products List",
            value: `${data.products?.length || 0} items`,
            children: [productSchema],
            collapsed: false,
          },
          {
            name: "Subproducts (nested)",
            value: `${subproductCount || 0} items`,
            children: [subproductSchema],
            collapsed: false,
          },
          metadataNode,
        ],
      },
    ];
  }, [data, focus, sampleProduct, sampleSubproduct, subproductCount]);

  const option = {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
    },
    series: [
      {
        type: "tree",
        data: treeData,
        top: "5%",
        left: "10%",
        bottom: "5%",
        right: "25%",
        symbolSize: 12,
        itemStyle: {
          color: "#38bdf8",
          borderColor: "#0ea5e9",
        },
        lineStyle: {
          color: "#475569",
          curveness: 0.5,
        },
        label: {
          position: "left",
          verticalAlign: "middle",
          align: "right",
          fontSize: 14,
          color: "#94a3b8",
          backgroundColor: "#0f172a",
          padding: [4, 8],
          borderRadius: 4,
          formatter: (params: any) => {
            return params.value ?
                `{a|${params.name}}\n{b|${params.value}}`
              : `{a|${params.name}}`;
          },
          rich: {
            a: { color: "#e2e8f0", fontSize: 13, fontWeight: "bold" },
            b: { color: "#64748b", fontSize: 11, paddingTop: 4 },
          },
        },
        leaves: {
          label: {
            position: "right",
            verticalAlign: "middle",
            align: "left",
            backgroundColor: "transparent",
          },
        },
        emphasis: {
          focus: "descendant",
        },
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
        initialTreeDepth: 2,
      },
    ],
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        Failed to load data for structure analysis.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-4 min-h-[70vh]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Explore the viewer schema
          </h2>
          <p className="text-muted-foreground">
            Switch between a relationship blueprint and live JSON samples to
            understand how the normalized library data is shaped.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-lg border">
          <Button
            variant={view === "tree" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("tree")}
            className="gap-2">
            <Network className="h-4 w-4" />
            Blueprint
          </Button>
          <Button
            variant={view === "json" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("json")}
            className="gap-2">
            <Code className="h-4 w-4" />
            Inspector
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <StatTile
          label="Products"
          value={String(data.total_products)}
          subtitle="Top-level purchase entries in the active library"
        />
        <StatTile
          label="Subproducts"
          value={String(subproductCount)}
          subtitle="Nested items exposed by the viewer tables"
        />
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            How to use this page
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Use <span className="font-semibold text-slate-100">Blueprint</span>{" "}
            to scan object relationships, then switch to{" "}
            <span className="font-semibold text-slate-100">Inspector</span> for
            live sample payloads. If you need an exported schema file, build it
            from Command Center.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/commands">Open Command Center</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Focus the view
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Isolate one branch when you want to inspect product fields, nested
              subproducts, or library-level metadata without the full tree
              competing for attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All branches"],
              ["products", "Products"],
              ["subproducts", "Subproducts"],
              ["metadata", "Metadata"],
            ].map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={focus === value ? "secondary" : "outline"}
                onClick={() =>
                  setFocus(
                    value as "all" | "products" | "subproducts" | "metadata",
                  )
                }>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden relative">
        {view === "tree" ?
          <ReactECharts
            echarts={echarts}
            option={option}
            style={{ height: "100%", width: "100%" }}
            theme="dark"
            opts={{ renderer: "svg" }}
          />
        : <div className="h-full flex flex-col p-4 space-y-4">
            <div className="flex space-x-2">
              <Button
                variant={sampleType === "product" ? "default" : "outline"}
                onClick={() => setSampleType("product")}>
                Sample Product
              </Button>
              <Button
                variant={sampleType === "subproduct" ? "default" : "outline"}
                onClick={() => setSampleType("subproduct")}>
                Sample Subproduct
              </Button>
              <Button
                variant={sampleType === "metadata" ? "default" : "outline"}
                onClick={() => setSampleType("metadata")}>
                Library Metadata
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              {sampleType === "product" ?
                <JsonBlock
                  title="First item from 'products'"
                  data={sampleProduct}
                />
              : sampleType === "subproduct" ?
                <JsonBlock
                  title="First item from 'products[].subproducts'"
                  data={sampleSubproduct}
                />
              : <JsonBlock
                  title="Library metadata summary"
                  data={metadataSample}
                />
              }
            </div>
          </div>
        }
      </div>
    </div>
  );
}

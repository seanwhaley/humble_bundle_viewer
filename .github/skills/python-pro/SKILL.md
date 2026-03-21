---
name: python-pro
description: "Use when advanced Python work is involved, especially performance tuning, profiling, async orchestration, concurrency tradeoffs, or deeper runtime-level design decisions."
---

# Python Pro

Use this skill for advanced Python engineering work that goes beyond ordinary style or structure improvements.

## Apply this skill when

- profiling slow Python paths
- designing async or concurrent workflows
- tuning memory, throughput, or startup behavior
- making advanced runtime or library tradeoff decisions

## Repository-specific focus

- optimize only after understanding the real bottleneck
- prefer pragmatic improvements that fit the current codebase over generic “latest ecosystem” churn
- keep CLI behavior, backend contracts, and artifact safety stable while tuning internals
- document workflow changes when tooling or operational behavior shifts

## Working principles

1. measure before optimizing
2. choose async, threads, or processes based on workload type
3. keep advanced patterns understandable to future maintainers
4. preserve correctness and safety before chasing speed

## Checklist

- [ ] the bottleneck or tradeoff is understood
- [ ] the chosen optimization matches the workload
- [ ] complexity added by the optimization is justified
- [ ] tests or smoke checks verify behavior stayed correct

## Use alongside

- `modern-python` for tooling and readability modernization
- `python-patterns` for broader architecture choices
- `project-tools-and-reporting` when profiling or reporting scripts are involved

---
name: subproduct-cache-triage
description: Review subproduct page cache artifacts, summarize failure patterns, and propose the smallest safe next fixes.
argument-hint: "cache-dir=data/artifacts/subproduct_pages optional-focus=domain failures"
---

Use the repository guidance in [GitHub customizations instructions](../instructions/github-customizations.instructions.md), [CLI runtime instructions](../instructions/cli-runtime.instructions.md), and [Subproduct enrichment workflows](../instructions/subproduct-enrichment.instructions.md).

Investigate the subproduct cache artifacts for `${input:cache-dir:data/artifacts/subproduct_pages}`.

When you run this prompt:

1. Inspect the manifest, cache log, and any related report artifacts.
2. Summarize current success/failure counts, notable failed domains, and whether failures look transport-related, content-related, or schema-related.
3. Identify the smallest safe implementation changes, if any, that would improve reliability or operator visibility.
4. Call out docs/tests that must change if code updates are needed.
5. Keep all examples and summaries free of cookies, signed URLs, or other sensitive values.

Return:

- a short state summary
- the highest-value follow-up actions
- any validation commands or artifact refresh steps that should be run
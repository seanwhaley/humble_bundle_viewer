---
name: refresh-subproduct-report
description: Refresh subproduct metadata analysis outputs from existing artifacts and verify the resulting report paths and summaries.
argument-hint: "cache-dir=data/artifacts/subproduct_pages report-file=data/artifacts/subproduct_pages/subproduct_metadata_coverage_summary.md"
---

Use the workflow guidance in [Project tools and reporting](../skills/project-tools-and-reporting/SKILL.md), [CLI runtime instructions](../instructions/cli-runtime.instructions.md), and [Subproduct enrichment workflows](../instructions/subproduct-enrichment.instructions.md).

For `${input:cache-dir:data/artifacts/subproduct_pages}` and `${input:report-file:data/artifacts/subproduct_pages/subproduct_metadata_coverage_summary.md}`:

1. Determine whether the report should be refreshed by the CLI or the reusable analysis script/module path already present in the repo.
2. Prefer the existing repo workflow instead of inventing a new command.
3. Regenerate the human-readable report.
4. Verify that output locations are clearly reported and that the resulting markdown summary is structurally sound.
5. Summarize the key coverage or failure findings.

Keep the result concise, operational, and free of sensitive values.
---
description: "Use when writing, reviewing, or restructuring README.md, docs/index.md, or other public-facing project landing pages. Covers open-source README best practices, value proposition, user journeys, scope boundaries, quick start structure, dependency clarity, security notes, and public GitHub presentation."
name: "README Standards"
applyTo: "{README.md,docs/index.md}"
---

# README and Landing Page Standards

- Lead with a short value proposition in plain language before technical details.
- Add an early paragraph or section describing the main user journeys the project supports.
- Be explicit about current scope and non-goals so the README matches what is actually built.
- Prefer sections that help a first-time visitor decide quickly:
  - what it does
  - who it is for
  - why it is useful
  - how to get started
- Distinguish between required dependencies and dependencies used only for certain workflows.
  - Example: if Playwright is only needed for capture/refresh, say so directly.
- Keep installation and first-run steps short and copyable.
- Mention privacy and security expectations near the top half of the file for sensitive tools.
- Prefer concrete workflow framing over generic feature lists.
  - Good: "capture your library, browse purchases, sync eBooks"
  - Less useful: "modern architecture, robust tooling"
- Avoid stale project-management language, phased implementation notes, or completed effort summaries in public landing pages.
- Avoid dead or speculative GitHub links before the repository metadata actually exists.
- For public GitHub presentation, a strong README usually includes:
  - project title
  - concise one-line description
  - optional simple badges
  - short promotional paragraph
  - user journeys or who-it-is-for section
  - scope and non-goals
  - quick start
  - key workflows or capabilities
  - security/privacy note
  - contributing and license links
- Keep the tone product-oriented and user-oriented, not just implementation-oriented.
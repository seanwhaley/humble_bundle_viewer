# Frontend E2E Tests

Place browser-driven viewer tests in this folder.

- Reserve this scope for end-to-end workflows that need real rendered browser behavior.
- Prefer Playwright-style tests and keep auth-sensitive coverage opt-in.
- Keep fast DOM-based coverage in `../unit/` and `../integration/` unless the scenario truly needs a browser.

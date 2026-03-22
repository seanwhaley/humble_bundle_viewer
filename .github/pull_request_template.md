# Pull request checklist

## Summary

- What changed?
- Why was it needed?
- What user or maintainer workflow does it improve?

## Scope

- Surface touched: CLI / backend / frontend / docs / `.github` / tools
- Related issue(s):

## Validation

- [ ] `python -m hb_library_viewer --help`
- [ ] `pytest backend/tests -v`
- [ ] `cd frontend && npm run build`
- [ ] `mkdocs build --strict`
- [ ] Other relevant validation is described below

### Validation notes

-

## Docs, config, and schema impact

- [ ] README updated if public behavior, scope, or maintainer-facing guidance changed
- [ ] docs updated if workflows, routes, commands, or configuration changed
- [ ] config/schema/artifact format changes are described explicitly

## GitHub customization impact

- [ ] This PR does not change `.github` customizations
- [ ] If it does, affected instructions, prompts, skills, agents, templates, or workflows were updated consistently
- [ ] If it does, any needed `.github/skills/README.md`, `CODEOWNERS`, and customization-validator updates were included

## Security and privacy

- [ ] No secrets, cookies, signed download URLs, or private artifacts were added to code, logs, screenshots, docs, or issues
- [ ] Any screenshots or logs included in the PR are sanitized

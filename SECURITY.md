# Security Policy

## Supported use

`HB Library Viewer` is intended for local, user-controlled workflows. The most sensitive data handled by the project includes:

- the `_simpleauth_sess` authentication cookie
- signed download URLs captured in local artifacts
- locally generated library data files

## Reporting a vulnerability

If you discover a security issue, please report it privately to the project maintainers rather than opening a public issue.

**Security contact:** Sean Whaley (`crazyandol@gmail.com`)

When reporting:

- do not include a real `_simpleauth_sess` value
- do not include signed download URLs
- do include reproduction steps, impact, affected files or routes, and any suggested mitigation

## What should not be reported publicly

Please avoid public disclosure of:

- credential leakage
- artifact files containing signed links
- screenshots or logs that expose secrets
- workflows that could allow unintended download or file disclosure behavior

## Response goals

The project should acknowledge valid reports promptly, confirm scope, and ship a fix or mitigation before public disclosure whenever practical.

# Security

`HB Library Viewer` handles sensitive local data such as:

- the `_simpleauth_sess` authentication cookie
- signed download URLs captured in local artifacts
- locally generated library snapshots and manifests

## Report issues privately

Please report security-sensitive issues privately to the maintainers instead of opening a public issue.

When reporting, include:

- affected area or route
- impact and severity
- safe reproduction steps
- suggested mitigation, if you have one

## Never post publicly

Do not post the following in issues, screenshots, discussions, or pull requests:

- real `_simpleauth_sess` values
- signed Humble Bundle download URLs
- artifact files from `data/artifacts/`
- logs that expose secrets or private local paths beyond what is necessary

For the repository-level policy used by GitHub, see the root `SECURITY.md` file.

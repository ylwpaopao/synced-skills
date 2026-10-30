# Synced skills

The user approved a GitHub repository containing upstream agent skills, updated
automatically, ready for the user to install through CC Switch themselves.
The chosen name is `synced-skills`.

## Approaches

- Copy just upstream skill directories: chosen because CC Switch downloads a
  branch archive and does not need the upstream application's source or history.
- Mirror the entire upstream repository: feasible, but larger and less suitable
  for collecting several independent upstreams.
- Import a ZIP locally: does not provide the requested online update source.

## Design

- Public repository: `ylwpaopao/synced-skills`, default branch `main`.
- `sources.json` lists the upstream repository, branch/tag/commit, skill path,
  license path and unique local skill ID. Adding a source needs one new entry.
- Initially sync `https://gitea.com/gitea/cli.git`, `main`, `skills/gt`.
- Preserve every file in the upstream skill directory and copy its upstream
  license into that directory. Never execute upstream code or modify skill prose.
- Store upstream commit provenance in `sources.lock.json`, outside skill folders.
- Validate all sources before replacing installed copies. Propagate upstream file
  deletions within each configured skill; leave unconfigured directories alone.
- Reject unsafe paths, duplicate IDs and symlinks rather than following them.
- GitHub Actions runs every Monday at 10:23 Asia/Shanghai and on manual dispatch,
  tests before syncing, and commits changes. A weekly check marker prevents
  60 days of repository inactivity.
- The user handles CC Switch registration and installation. Do not modify it.

## Implementation choices

Use Bun without third-party dependencies, real local Git fixtures for tests, and
commit-pinned checkout/setup-bun actions. Do not modify CC Switch settings or
installed skills. Support SHA-1 and SHA-256 upstream Git repositories.

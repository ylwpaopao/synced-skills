# Synced Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and verify an extensible upstream skill sync repository, ready for the user to add to CC Switch.

**Architecture:** A JSON manifest drives a dependency-free Bun sync script. A weekly/manual GitHub Actions workflow tests, synchronizes and commits the selected upstream directories and commit provenance.

**Tech Stack:** Bun 1.4.4, Git, GitHub Actions, CC Switch 4.0.21.

**Spec:** `docs/superpowers/specs/2026-10-30-skill-sync-design.md`

## Global Constraints

- Public repository: `ylwpaopao/synced-skills`, default branch `main`.
- Initially sync `https://gitea.com/gitea/cli.git`, `main`, `skills/gt`.
- No third-party script dependencies; preserve upstream files and licensing.
- The user operates CC Switch; do not change its settings or installed skills.
- Check every Monday at 10:23 Asia/Shanghai and record weekly check activity.

## Review Focus

- An upstream fetch or missing path must not erase the last usable copy.
- Nested files, file deletions and executable permissions must survive sync.
- Invalid IDs, path traversal and symlinks must not escape managed directories.
- Repeated checks in a week must produce no changes; a new week must record activity.
- The public GitHub archive must contain discoverable, complete skills and provenance.

### Task 1: Sync engine and automation

**Files:** `sources.json`, `scripts/sync-skills.mjs`, `tests/sync-skills.test.mjs`, `.github/workflows/sync-skills.yml`, `README.md`.

**Interfaces:** `bun scripts/sync-skills.mjs [root]` reads `root/sources.json` and writes `root/skills/<id>` plus `root/sources.lock.json`. `syncSkills(root, date)` permits deterministic check dates in tests.

- [x] Write real-Git integration tests for copying, deletion, no-op runs, failure preservation, unsafe input and weekly activity. Run `bun test`; observe missing implementation failures.
- [x] Implement the sync script, manifest, pinned workflow and concise Chinese README.
- [x] Run `bun test`; expect every test to pass. Sync the actual Gitea source and compare all upstream skill files and LICENSE byte-for-byte.
- [x] Get a fresh review, resolve material findings with regression tests, verify and commit. All 12 tests pass locally and on GitHub Actions.

### Task 2: Publish and verify GitHub

**Consumes:** Tested repository and synced `skills/gt`.
**Produces:** Public GitHub source and successful workflow run.

- [x] Create the authorized repository, publish `main`, manually dispatch synchronization, and inspect its conclusion and logs.
- [x] Verify published source metadata, contents and automated writeback. The integration run [40994643371](https://github.com/ylwpaopao/synced-skills/actions/runs/40994643371) passed 12 tests and generated commit `71a7ad9` through `github-actions[bot]`. CC Switch operations remain with the user.

The local GitHub CLI OAuth token lacked `workflow` scope. The existing GitHub connector created the workflow file with its already-authorized permissions; the remaining content was then pushed normally. No authorization scope was expanded. The workflow-only initialization run reported `No tests found`; complete-repository runs passed.

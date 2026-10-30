import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../scripts/sync-skills.mjs");
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function file(path, contents) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Sync Test", "-c", "user.email=sync@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture(objectFormat = "sha1") {
  const dir = mkdtempSync(join(tmpdir(), "synced-skills-test-"));
  temporary.push(dir);
  const upstream = join(dir, "upstream");
  const root = join(dir, "output");
  mkdirSync(upstream);
  mkdirSync(root);
  git(upstream, "init", "-b", "main", `--object-format=${objectFormat}`);
  file(join(upstream, "skills/demo/SKILL.md"), "---\nname: demo\ndescription: Example\n---\n\nUpstream instructions.\n");
  file(join(upstream, "skills/demo/references/nested.md"), "Reference content.\n");
  file(join(upstream, "skills/demo/scripts/run.sh"), "#!/bin/sh\nprintf hello\n");
  chmodSync(join(upstream, "skills/demo/scripts/run.sh"), 0o755);
  file(join(upstream, "LICENSE"), "Upstream license.\n");
  file(join(upstream, "application.go"), "Not a skill.\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Initial upstream");
  const sources = [{ id: "demo", repository: upstream, ref: "main", path: "skills/demo", license: "LICENSE" }];
  const configure = (value = sources) => file(join(root, "sources.json"), JSON.stringify(value));
  configure();
  return { upstream, root, sources, configure };
}

function run(root) {
  return spawnSync(process.execPath, [script, root], { encoding: "utf8", timeout: 30000 });
}

function snapshot(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? [{ path: relative, type: "directory" }, ...snapshot(path, relative)]
      : [{ path: relative, type: "file", bytes: readFileSync(path).toString("hex"), executable: statSync(path).mode & 0o111 }];
  });
}

test("copies exactly the upstream skill tree and keeps supplemental licensing outside it", () => {
  const { upstream, root } = fixture();
  const result = run(root);
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(root, "skills/demo/SKILL.md"), "utf8")).toBe(readFileSync(join(upstream, "skills/demo/SKILL.md"), "utf8"));
  expect(readFileSync(join(root, "skills/demo/references/nested.md"), "utf8")).toBe("Reference content.\n");
  expect(snapshot(join(root, "skills/demo"))).toEqual(snapshot(join(upstream, "skills/demo")));
  expect(existsSync(join(root, "licenses/demo/LICENSE"))).toBe(true);
  expect(readFileSync(join(root, "licenses/demo/LICENSE"), "utf8")).toBe("Upstream license.\n");
  expect(statSync(join(root, "skills/demo/scripts/run.sh")).mode & 0o111).not.toBe(0);
  expect(existsSync(join(root, "skills/demo/application.go"))).toBe(false);
  expect(JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).sources.demo.commit).toBe(git(upstream, "rev-parse", "HEAD"));
});

test("preserves an original skill license without overwriting it with the repository license", () => {
  const { upstream, root } = fixture();
  file(join(upstream, "skills/demo/LICENSE"), "Original skill-specific license.\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Add the skill's own license");
  expect(run(root).status).toBe(0);
  expect(readFileSync(join(root, "skills/demo/LICENSE"), "utf8")).toBe("Original skill-specific license.\n");
  expect(snapshot(join(root, "skills/demo"))).toEqual(snapshot(join(upstream, "skills/demo")));
});

test("repairs existing copies by removing previously injected files", () => {
  const { upstream, root } = fixture();
  file(join(root, "skills/demo/LICENSE"), "Previously injected license.\n");
  file(join(root, "skills/demo/sync-metadata.json"), "{}\n");
  expect(run(root).status).toBe(0);
  expect(snapshot(join(root, "skills/demo"))).toEqual(snapshot(join(upstream, "skills/demo")));
});

test("synchronizes SHA-256 upstream repositories such as the official Gitea CLI", () => {
  const { upstream, root } = fixture("sha256");
  const result = run(root);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).sources.demo.commit).toBe(git(upstream, "rev-parse", "HEAD"));
  expect(readFileSync(join(root, "skills/demo/references/nested.md"), "utf8")).toBe("Reference content.\n");
});

test("propagates upstream deletions while preserving other managed skills", () => {
  const { upstream, root } = fixture();
  expect(run(root).status).toBe(0);
  file(join(root, "skills/other/SKILL.md"), "Keep me.\n");
  rmSync(join(upstream, "skills/demo/references/nested.md"));
  file(join(upstream, "skills/demo/references/new.md"), "New reference.\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Replace reference");
  expect(run(root).status).toBe(0);
  expect(existsSync(join(root, "skills/demo/references/nested.md"))).toBe(false);
  expect(readFileSync(join(root, "skills/demo/references/new.md"), "utf8")).toBe("New reference.\n");
  expect(readFileSync(join(root, "skills/other/SKILL.md"), "utf8")).toBe("Keep me.\n");
});

test("leaves the previous copies and provenance untouched if a later upstream fails", () => {
  const { upstream, root, sources, configure } = fixture();
  expect(run(root).status).toBe(0);
  const before = readFileSync(join(root, "sources.lock.json"), "utf8");
  file(join(upstream, "skills/demo/SKILL.md"), "Changed upstream.\n");
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Change skill");
  configure([...sources, { ...sources[0], id: "missing", path: "skills/missing" }]);
  expect(run(root).status).not.toBe(0);
  expect(readFileSync(join(root, "skills/demo/SKILL.md"), "utf8")).toContain("Upstream instructions.");
  expect(readFileSync(join(root, "sources.lock.json"), "utf8")).toBe(before);
});

test("rejects traversal before writing outside skills", () => {
  const { root, sources, configure } = fixture();
  configure([{ ...sources[0], id: "../escape" }]);
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/invalid.*id/i);
  expect(existsSync(join(root, "escape"))).toBe(false);
});

test("rejects duplicate destination IDs", () => {
  const { root, sources, configure } = fixture();
  configure([sources[0], sources[0]]);
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/duplicate/i);
});

test("rejects upstream symlinks without overwriting the installed skill", () => {
  const { upstream, root } = fixture();
  expect(run(root).status).toBe(0);
  symlinkSync("../../LICENSE", join(upstream, "skills/demo/linked-license"));
  git(upstream, "add", ".");
  git(upstream, "commit", "-m", "Add a symlink");
  expect(run(root).status).not.toBe(0);
  expect(existsSync(join(root, "skills/demo/linked-license"))).toBe(false);
  expect(readFileSync(join(root, "licenses/demo/LICENSE"), "utf8")).toBe("Upstream license.\n");
});

test.each([
  ["demo", "checkout-demo"],
  ["checkout-demo", "demo"],
])("keeps independent temporary namespaces for source IDs %s and %s", (first, second) => {
  const { root, sources, configure } = fixture();
  configure([{ ...sources[0], id: first }, { ...sources[0], id: second }]);
  const result = run(root);
  expect(result.status, result.stderr).toBe(0);
  for (const id of [first, second]) {
    expect(readFileSync(join(root, "skills", id, "references/nested.md"), "utf8")).toBe("Reference content.\n");
    expect(existsSync(join(root, "skills", id, ".git"))).toBe(false);
    expect(existsSync(join(root, "skills", id, "application.go"))).toBe(false);
    expect(existsSync(join(root, "skills", id, "skills"))).toBe(false);
  }
});

test.each(["sources.lock.json", "licenses"])("rejects a dangling %s output symlink before creating an external target", (output) => {
  const { root } = fixture();
  const outside = join(root, "../must-not-be-created.json");
  symlinkSync(outside, join(root, output));
  const result = run(root);
  expect(result.status).not.toBe(0);
  expect(existsSync(outside)).toBe(false);
  expect(existsSync(join(root, "skills/demo"))).toBe(false);
});

test("retains provenance for an unconfigured copy until that copy is explicitly removed", () => {
  const { root, sources, configure } = fixture();
  configure([sources[0], { ...sources[0], id: "archived" }]);
  expect(run(root).status).toBe(0);
  const prior = JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).sources.archived;
  configure();
  expect(run(root).status).toBe(0);
  expect(readFileSync(join(root, "skills/archived/references/nested.md"), "utf8")).toBe("Reference content.\n");
  expect(JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).sources.archived).toEqual(prior);
  rmSync(join(root, "skills/archived"), { recursive: true });
  expect(run(root).status).toBe(0);
  expect(JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).sources.archived).toBeUndefined();
});

test("repeated checks are unchanged within a week and record activity the next week", async () => {
  const { root } = fixture();
  // Import after the executable boundary tests so a missing module still fails clearly.
  expect(run(root).status).toBe(0);
  const { syncSkills } = await import(script);
  await syncSkills(root, new Date("2026-10-26T00:00:00Z"));
  const before = readFileSync(join(root, "sources.lock.json"), "utf8");
  await syncSkills(root, new Date("2026-10-30T00:00:00Z"));
  expect(readFileSync(join(root, "sources.lock.json"), "utf8")).toBe(before);
  await syncSkills(root, new Date("2026-11-02T00:00:00Z"));
  expect(JSON.parse(readFileSync(join(root, "sources.lock.json"), "utf8")).checkedWeek).toBe("2026-11-02");
  expect(readFileSync(join(root, "skills/demo/references/nested.md"), "utf8")).toBe("Reference content.\n");
});

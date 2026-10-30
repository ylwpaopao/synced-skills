import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || "Git failed");
  }
  return result.stdout.trim();
}

function validPath(value, allowRoot = false) {
  return typeof value === "string" && (
    (allowRoot && value === ".") ||
    (!isAbsolute(value) && !value.includes("\\") && value.split("/").every((part) => part && part !== "." && part !== ".."))
  );
}

function validate(sources) {
  if (!Array.isArray(sources) || !sources.length) throw new Error("sources.json must contain at least one source");
  const ids = new Set();
  for (const source of sources) {
    if (!source || !/^[a-z0-9][a-z0-9_-]*$/.test(source.id ?? "")) throw new Error("Invalid skill id");
    if (ids.has(source.id)) throw new Error(`Duplicate skill id: ${source.id}`);
    ids.add(source.id);
    if (typeof source.repository !== "string" || !source.repository.trim() ||
        (!/^https?:\/\//.test(source.repository) && !isAbsolute(source.repository))) {
      throw new Error(`Invalid repository for ${source.id}: use an HTTP(S) URL or absolute local path`);
    }
    if (typeof source.ref !== "string" || !source.ref.trim()) throw new Error(`Missing ref for ${source.id}`);
    if (!validPath(source.path, true) || !validPath(source.license)) throw new Error(`Invalid upstream path for ${source.id}`);
  }
}

function assertTree(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${path}`);
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (name !== ".git") assertTree(join(path, name));
    }
  } else if (!info.isFile()) {
    throw new Error(`Unsupported file type: ${path}`);
  }
}

export function syncSkills(root, date = new Date()) {
  root = resolve(root);
  const sources = JSON.parse(readFileSync(join(root, "sources.json"), "utf8"));
  validate(sources);
  const skills = join(root, "skills");
  const licenses = join(root, "licenses");
  const lockPath = join(root, "sources.lock.json");
  for (const path of [skills, licenses, lockPath]) {
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Refusing an output symlink: ${path}`);
  }

  const temporary = mkdtempSync(join(tmpdir(), "synced-skills-"));
  const weekStart = new Date(date);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  const lock = { version: 1, checkedWeek: weekStart.toISOString().slice(0, 10), sources: {} };
  try {
    const previous = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
    const configured = new Set(sources.map(({ id }) => id));
    for (const [id, provenance] of Object.entries(previous.sources ?? {})) {
      if (!configured.has(id) && /^[a-z0-9][a-z0-9_-]*$/.test(id) &&
          lstatSync(join(skills, id), { throwIfNoEntry: false })?.isDirectory()) {
        lock.sources[id] = provenance;
      }
    }
    // Prepare every source before touching any existing skill copy.
    for (const source of sources) {
      const checkout = join(temporary, "checkouts", source.id);
      const prepared = join(temporary, "prepared", source.id);
      mkdirSync(checkout, { recursive: true });
      const advertised = git(checkout, "ls-remote", "--", source.repository, "HEAD").split(/\s/)[0];
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(advertised)) throw new Error(`Cannot determine Git object format for ${source.id}`);
      git(checkout, "init", "--quiet", `--object-format=${advertised.length === 64 ? "sha256" : "sha1"}`);
      git(checkout, "remote", "add", "upstream", source.repository);
      git(checkout, "fetch", "--quiet", "--depth=1", "--filter=blob:none", "--no-tags", "upstream", source.ref);
      const commit = git(checkout, "rev-parse", "FETCH_HEAD");
      git(checkout, "checkout", "--quiet", "FETCH_HEAD", "--", source.path, source.license);
      const skillPath = join(checkout, source.path);
      const licensePath = join(checkout, source.license);
      assertTree(skillPath);
      assertTree(licensePath);
      if (!lstatSync(join(skillPath, "SKILL.md")).isFile() || !lstatSync(licensePath).isFile()) {
        throw new Error(`Missing SKILL.md or license for ${source.id}`);
      }
      cpSync(skillPath, prepared, { recursive: true, filter: (path) => basename(path) !== ".git" });
      const preparedLicense = join(temporary, "licenses", source.id);
      mkdirSync(preparedLicense, { recursive: true });
      cpSync(licensePath, join(preparedLicense, "LICENSE"));
      lock.sources[source.id] = { repository: source.repository, ref: source.ref, path: source.path, license: source.license, commit };
    }

    mkdirSync(skills, { recursive: true });
    mkdirSync(licenses, { recursive: true });
    for (const { id } of sources) {
      const destination = join(skills, id);
      rmSync(destination, { recursive: true, force: true });
      cpSync(join(temporary, "prepared", id), destination, { recursive: true });
      const licenseDestination = join(licenses, id);
      rmSync(licenseDestination, { recursive: true, force: true });
      cpSync(join(temporary, "licenses", id), licenseDestination, { recursive: true });
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    return lock;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const lock = syncSkills(process.argv[2] || process.cwd());
    for (const [id, source] of Object.entries(lock.sources)) console.log(`${id}: ${source.commit}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

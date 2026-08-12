import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mngRoot = resolve(appRoot, "..", "mng");
const targets = [
  [mngRoot, "docs/app/requirements", true],
  [mngRoot, "docs/app/external-design", true],
  [mngRoot, "WORKFLOW.md", false],
  [appRoot, "docs/internal-design", true],
  [appRoot, "AGENTS.md", false],
  [appRoot, "DESIGN_LOG.md", false],
  [appRoot, "README.md", false],
];

const errors = [];
const files = targets.flatMap(([root, target, recursive]) => collectFiles(join(root, target), recursive));

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const originRoot = isInside(file, mngRoot) ? mngRoot : appRoot;
  for (const reference of markdownLinks(source)) {
    checkReference(file, originRoot, reference.target, reference.line, "Markdown link");
  }
  for (const reference of wikiLinks(source)) {
    checkReference(file, originRoot, reference.target, reference.line, "Wikilink");
  }
  for (const reference of logicalReferences(source)) {
    checkLogicalReference(file, reference, originRoot);
  }
}

if (errors.length) {
  console.error(`Documentation link check failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation link check passed (${files.length} files checked).`);
}

function collectFiles(target, recursive) {
  if (!existsSync(target)) return [];
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = join(target, entry.name);
    if (entry.isDirectory()) return recursive ? collectFiles(child, true) : [];
    return entry.isFile() && extname(entry.name) === ".md" ? [child] : [];
  });
}

function markdownLinks(source) {
  return matches(source, /!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g, 1)
    .filter(({ target, groups }) => !isExternal(target) && target !== "docs/internal-design/xxx.md#anchor-id" && !/\]\([^)]*\s[^)]*\)$/.test(groups[0]));
}

function wikiLinks(source) {
  return matches(source, /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, 1)
    .filter(({ target }) => !target.startsWith("^"));
}

function logicalReferences(source) {
  return matches(
    source,
    /(?<![\w/-])(internal-design|external-design|requirements)\/([A-Za-z0-9][\w.-]*\.md)(#[a-z0-9][a-z0-9-]*)?/g,
    0,
  );
}

function matches(source, pattern, group) {
  return [...source.matchAll(pattern)].map((match) => ({
    target: group === 0 ? match[0] : match[group],
    groups: match,
    line: source.slice(0, match.index).split("\n").length,
  }));
}

function checkReference(file, originRoot, rawTarget, line, kind) {
  const [rawPath, fragment] = splitFragment(decodeURIComponent(rawTarget));
  if (!rawPath && !fragment) return;
  const target = resolveReferencePath(rawPath, file, originRoot);
  if (!target || !existsSync(target)) {
    report(file, line, `${kind} target not found: ${rawTarget}`);
    return;
  }
  if (fragment && isExplicitAnchor(fragment)) checkAnchor(file, line, target, fragment);
}

function checkLogicalReference(file, reference, originRoot) {
  const [, category, name, fragment = ""] = reference.groups;
  const targetRoot = category === "internal-design" ? appRoot : mngRoot;
  const target = category === "internal-design"
    ? join(targetRoot, "docs", category, name)
    : join(targetRoot, "docs", "app", category, name);
  if (!existsSync(target)) {
    report(file, reference.line, `Logical reference target not found: ${reference.target}`);
    return;
  }
  if (fragment) checkAnchor(file, reference.line, target, fragment.slice(1));
}

function resolveReferencePath(rawPath, file, originRoot) {
  if (!rawPath) return file;
  const candidates = [];
  if (rawPath.startsWith("/")) candidates.push(join(originRoot, rawPath));
  else {
    candidates.push(resolve(dirname(file), rawPath));
    candidates.push(resolve(originRoot, rawPath));
    if (!extname(rawPath)) {
      const searchRoots = originRoot === mngRoot
        ? [join(mngRoot, "docs/app/requirements"), join(mngRoot, "docs/app/external-design")]
        : [join(appRoot, "docs/internal-design")];
      candidates.push(...searchRoots.map((root) => join(root, rawPath)));
    }
  }
  for (const candidate of candidates) {
    for (const withExtension of expandMarkdownPath(candidate)) {
      if (existsSync(withExtension)) return withExtension;
    }
  }
  return null;
}

function expandMarkdownPath(candidate) {
  if (extname(candidate)) return [candidate];
  return [candidate, `${candidate}.md`, join(candidate, "index.md")];
}

function checkAnchor(file, line, target, anchor) {
  const anchorPattern = new RegExp(`<a\\s+id=["']${escapeRegExp(anchor)}["']\\s*><\\/a>`, "i");
  if (!anchorPattern.test(readFileSync(target, "utf8"))) {
    report(file, line, `Explicit anchor not found: ${displayPath(target)}#${anchor}`);
  }
}

function splitFragment(target) {
  const index = target.indexOf("#");
  return index === -1 ? [target, ""] : [target.slice(0, index), target.slice(index + 1)];
}

function isExternal(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|mailto:)/i.test(target);
}

function isExplicitAnchor(fragment) {
  return /^[a-z0-9][a-z0-9-]*$/.test(fragment);
}

function report(file, line, message) {
  errors.push(`${displayPath(file)}:${line}: ${message}`);
}

function displayPath(file) {
  const base = isInside(file, appRoot) ? appRoot : mngRoot;
  return relative(base, file).split(sep).join("/");
}

function isInside(file, root) {
  const path = normalize(file);
  const base = `${normalize(root)}${sep}`;
  return path === normalize(root) || path.startsWith(base);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

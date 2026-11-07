import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const gguiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const projectRoot = resolve(gguiDir, "..");

const projectRequire = createRequire(join(projectRoot, "package.json"));

function walkUpToPackage(file) {
  let dir = dirname(file);
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${file}`);
    dir = parent;
  }
  return dir;
}

const cliPackageDir = realpathSync(walkUpToPackage(projectRequire.resolve("@ggui-ai/cli/push")));
const cliSiblingsDir = resolve(cliPackageDir, "..", "..");

/* pnpm layout: .pnpm/@ggui-ai+cli@<ver>/node_modules/{@ggui-ai/*,esbuild,zod,...} are siblings of the cli package. */
export function packageDirFromCli(name) {
  const direct = join(cliSiblingsDir, name);
  if (existsSync(join(direct, "package.json"))) return realpathSync(direct);
  const storeDir = resolve(cliSiblingsDir, "..", "..");
  const prefix = name.replace("/", "+") + "@";
  const match = readdirSync(storeDir).filter((d) => d.startsWith(prefix)).sort()[0];
  const transitive = match ? join(storeDir, match, "node_modules", name) : undefined;
  if (transitive && existsSync(join(transitive, "package.json"))) return realpathSync(transitive);
  throw new Error(`package ${name} not found beside @ggui-ai/cli (${direct}) nor in the pnpm store (${storeDir})`);
}

function exportTarget(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return exportTarget(value[0]);
  if (value && typeof value === "object") {
    for (const key of ["import", "node", "default", "require"]) {
      if (key in value) return exportTarget(value[key]);
    }
  }
  return undefined;
}

export function resolveFromCli(specifier) {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const subpath = "." + specifier.slice(name.length);
  const dir = packageDirFromCli(name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
  const target = pkg.exports ? exportTarget(pkg.exports[subpath] ?? (subpath === "." ? pkg.exports : undefined)) : subpath === "." ? pkg.module ?? pkg.main : subpath;
  if (!target) throw new Error(`${specifier} has no resolvable export (${subpath})`);
  return join(dir, target);
}

export function importFromCli(specifier) {
  return import(pathToFileURL(resolveFromCli(specifier)).href);
}

export const SANDBOX_EXTERNALS = [
  "react", "react/*", "react-dom", "react-dom/*",
  "@ggui-ai/design", "@ggui-ai/design/*",
  "@ggui-ai/wire", "@ggui-ai/wire/*",
  "@ggui-ai/mcp-apps-react", "@ggui-ai/mcp-apps-react/*",
];

export async function compileTsx(entryFile, absWorkingDir) {
  const { build } = await importFromCli("esbuild");
  return build({
    entryPoints: [entryFile],
    bundle: true,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "react",
    platform: "browser",
    minify: false,
    write: false,
    external: SANDBOX_EXTERNALS,
    absWorkingDir,
    treeShaking: true,
    logLevel: "silent",
  });
}

export async function loadProject() {
  const { GguiJsonV1 } = await importFromCli("@ggui-ai/project-config");
  const { discoverLocalUis } = await importFromCli("@ggui-ai/project-config/node");
  const raw = JSON.parse(readFileSync(join(gguiDir, "ggui.json"), "utf-8"));
  const manifest = GguiJsonV1.parse(raw);
  const discovery = await discoverLocalUis({ projectRoot: gguiDir, manifest });
  return { manifest, discovery };
}

export async function loadRegistry() {
  return JSON.parse(readFileSync(join(gguiDir, "registry.json"), "utf-8"));
}

export function registryEntryForUi(registry, uiId) {
  const found = Object.entries(registry.entries).find(([, e]) => e.uiId === uiId);
  if (!found) throw new Error(`registry.json has no entry with uiId "${uiId}"`);
  return { logicalId: found[0], entry: found[1] };
}

export function resolveComponentFile(manifestPath, manifest) {
  if (manifest.entryPoint) return resolve(gguiDir, manifest.entryPoint);
  for (const name of ["ggui.ui.tsx", "index.tsx", "component.tsx"]) {
    const candidate = join(dirname(manifestPath), name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`no entry file beside ${manifestPath}`);
}

#!/usr/bin/env node
/**
 * Validates everything under ggui/ the way the GGUI toolchain and guuey deploy
 * will: ggui.json schema + blueprint discovery, DataContract parse, single-ID
 * variant enums and action names against registry.json, esbuild compile with
 * the sandbox externals, tsc typecheck against the real @ggui-ai types, theme
 * document load, fixture props against propsSpec, and a pool-artifact
 * round-trip (fromPortableBlueprint + isolated compile, as guuey deploy does).
 * Exit code 1 on any failure.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compileTsx, gguiDir, importFromCli, loadProject, loadRegistry, packageDirFromCli, projectRoot, registryEntryForUi, resolveComponentFile, resolveFromCli } from "./lib/ggui-modules.mjs";

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
};

const { manifest, discovery } = await loadProject();
record("ggui.json parses (GguiJsonV1 strict)", true, `include=${JSON.stringify(manifest.blueprints.include)}`);
record("blueprint discovery has no issues", discovery.issues.length === 0, discovery.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
record("five blueprints discovered", discovery.uis.length === 5, discovery.uis.map((u) => u.id).join(", "));

const registry = await loadRegistry();
const protocol = await importFromCli("@ggui-ai/protocol");
const dataContractSchema = protocol.dataContractSchema ?? (await import(new URL("../schemas/data-contract.js", `file://${resolveFromCli("@ggui-ai/protocol")}`))).dataContractSchema;

for (const ui of discovery.uis) {
  const { logicalId, entry } = registryEntryForUi(registry, ui.id);
  const parsed = dataContractSchema.safeParse(ui.manifest.contract);
  record(`${logicalId}: contract parses (protocol dataContractSchema)`, parsed.success, parsed.success ? "" : parsed.error.message.slice(0, 300));
  const variantEnum = ui.manifest.contract.propsSpec?.properties?.variant?.schema?.enum;
  record(`${logicalId}: variant enum is exactly ["${logicalId}"]`, Array.isArray(variantEnum) && variantEnum.length === 1 && variantEnum[0] === logicalId, JSON.stringify(variantEnum));
  const actions = Object.keys(ui.manifest.contract.actionSpec ?? {}).sort();
  record(`${logicalId}: actions match registry`, JSON.stringify(actions) === JSON.stringify([...entry.actions].sort()), actions.join(", "));
  const missingNextStep = Object.values(ui.manifest.contract.actionSpec ?? {}).filter((a) => a.nextStep !== undefined);
  record(`${logicalId}: no nextStep without agentCapabilities`, missingNextStep.length === 0 || ui.manifest.contract.agentCapabilities !== undefined);
}

const compiled = new Map();
for (const ui of discovery.uis) {
  const { logicalId } = registryEntryForUi(registry, ui.id);
  const file = resolveComponentFile(ui.manifestPath, ui.manifest);
  try {
    const out = await compileTsx(file, gguiDir);
    const code = out.outputFiles[0]?.text ?? "";
    const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    const foreign = imports.filter((i) => !/^(react|react\/|react-dom|@ggui-ai\/design|@ggui-ai\/wire|@ggui-ai\/mcp-apps-react)/.test(i));
    compiled.set(ui.id, code);
    record(`${logicalId}: esbuild compile`, true, `${code.length} bytes, warnings=${out.warnings.length}, imports=${[...new Set(imports)].join(",")}`);
    record(`${logicalId}: bundle imports only sandbox externals`, foreign.length === 0, foreign.join(","));
  } catch (err) {
    record(`${logicalId}: esbuild compile`, false, String(err?.errors?.map((e) => e.text).join("; ") ?? err));
  }
}

const designPkg = packageDirFromCli("@ggui-ai/design");
const wirePkg = packageDirFromCli("@ggui-ai/wire");
const reactTypes = packageDirFromCli("@types/react");
const tmp = await mkdtemp(join(tmpdir(), "ptbook-ggui-tsc-"));
const tsconfig = {
  compilerOptions: {
    target: "es2020", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, noEmit: true, skipLibCheck: true, isolatedModules: true, types: [],
    baseUrl: gguiDir,
    paths: {
      "react": [join(reactTypes, "index.d.ts")],
      "react/jsx-runtime": [join(reactTypes, "jsx-runtime.d.ts")],
      "@ggui-ai/design": [join(designPkg, "dist/index.d.ts")],
      "@ggui-ai/wire": [join(wirePkg, "dist/index.d.ts")],
    },
  },
  files: discovery.uis.map((ui) => resolveComponentFile(ui.manifestPath, ui.manifest)),
};
await writeFile(join(tmp, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
const tsc = spawnSync(process.execPath, [join(projectRoot, "node_modules/typescript/bin/tsc"), "-p", join(tmp, "tsconfig.json"), "--pretty", "false"], { encoding: "utf-8" });
record("tsc --noEmit (strict) on all components", tsc.status === 0, tsc.status === 0 ? "0 errors" : (tsc.stdout + tsc.stderr).trim().split("\n").slice(0, 12).join(" | "));
await rm(tmp, { recursive: true, force: true });

const { safeParseThemeDocument } = await importFromCli("@ggui-ai/project-config");
const { loadTheme } = await importFromCli("@ggui-ai/project-config/node");
const themeRaw = JSON.parse(await readFile(join(gguiDir, "themes/ptbook.theme.json"), "utf-8"));
const themeParse = safeParseThemeDocument(themeRaw);
record("themes/ptbook.theme.json parses (ThemeDocument)", themeParse.success, themeParse.success ? "" : themeParse.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
const themeLoad = loadTheme({ projectRoot: gguiDir, manifest });
record("ggui.json#theme loads for light and dark", themeLoad.ok, themeLoad.ok ? `source=${themeLoad.theme.source} light=${Object.keys(themeLoad.theme.overlays.light).length} dark=${Object.keys(themeLoad.theme.overlays.dark).length} vars` : themeLoad.issue.message);

let Validator = null;
try {
  ({ Validator } = await import(new URL("file://" + join(packageDirFromCli("@ggui-ai/iframe-runtime"), "node_modules/@cfworker/json-schema/dist/index.js"))));
} catch {
  Validator = null;
}
for (const ui of discovery.uis) {
  const { logicalId, entry } = registryEntryForUi(registry, ui.id);
  const fixture = JSON.parse(await readFile(join(gguiDir, entry.fixtures), "utf-8"));
  const props = ui.manifest.contract.propsSpec.properties;
  const required = Object.entries(props).filter(([, p]) => p.required).map(([k]) => k);
  const missing = required.filter((k) => !(k in fixture));
  if (Validator) {
    const schema = { type: "object", properties: Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.schema])), required, additionalProperties: false };
    const v = new Validator(schema, "2020-12", false).validate(fixture);
    record(`${logicalId}: fixtures.json satisfies propsSpec`, v.valid, v.valid ? `${required.length} required props` : v.errors.slice(0, 4).map((e) => `${e.instanceLocation}: ${e.error}`).join("; "));
  } else {
    record(`${logicalId}: fixtures.json has all required props`, missing.length === 0, missing.join(","));
  }
}

const { parsePoolArtifactManifest, POOL_ARTIFACT_CODES_DIR, POOL_ARTIFACT_MANIFEST_FILENAME } = await importFromCli("@ggui-ai/artifact-manifest");
const { fromPortableBlueprint } = await importFromCli("@ggui-ai/protocol/blueprint-key");
const blueprintsDir = join(gguiDir, "blueprints");
let poolManifest = null;
try {
  const parsed = parsePoolArtifactManifest(await readFile(join(blueprintsDir, POOL_ARTIFACT_MANIFEST_FILENAME), "utf-8"));
  record("pool artifact manifest parses", parsed.ok && parsed.issues.length === 0, parsed.ok ? `${parsed.manifest.blueprints.length} entries` : parsed.reason);
  poolManifest = parsed.ok ? parsed.manifest : null;
} catch (err) {
  record("pool artifact manifest parses", false, String(err));
}
let payloadBytes = 0;
if (poolManifest) {
  const seenKeys = new Set();
  for (const entry of poolManifest.blueprints) {
    const body = await readFile(join(blueprintsDir, POOL_ARTIFACT_CODES_DIR, entry.codeRef), "utf-8");
    const sha = createHash("sha256").update(body, "utf-8").digest("hex");
    const imported = fromPortableBlueprint({ ...entry.record, componentCode: body });
    const logicalId = imported.ok ? imported.record.variance?.context?.logicalId : entry.codeRef;
    record(`${logicalId}: pool record imports (fromPortableBlueprint)`, imported.ok && !imported.keyMismatch, imported.ok ? `contractHash=${imported.record.contractHash.slice(0, 12)} variantKey=${imported.record.variantKey.slice(0, 12)} keyMismatch=${imported.keyMismatch}` : imported.reason);
    record(`${logicalId}: codeRef matches sha256 of body`, entry.codeRef === `${sha}.tsx`);
    const sourceUi = discovery.uis.find((u) => registry.entries[logicalId]?.uiId === u.id);
    const sourceCode = sourceUi ? await readFile(resolveComponentFile(sourceUi.manifestPath, sourceUi.manifest), "utf-8") : null;
    record(`${logicalId}: pool body equals component.tsx (run build-pool after edits)`, sourceCode === body);
    if (imported.ok) {
      const key = `${imported.record.contractHash}:${imported.record.variantKey}`;
      record(`${logicalId}: contractHash+variantKey unique`, !seenKeys.has(key));
      seenKeys.add(key);
      const reg = registry.entries[logicalId];
      record(`${logicalId}: registry keys match pool`, reg?.contractHash === imported.record.contractHash && reg?.variantKey === imported.record.variantKey && reg?.codeRef === entry.codeRef && reg?.status === "planned" && reg?.blueprintId === null, `status=${reg?.status} blueprintId=${reg?.blueprintId}`);
    }
    const isoDir = await mkdtemp(join(tmpdir(), "ptbook-ggui-iso-"));
    try {
      const isoFile = join(isoDir, "blueprint.tsx");
      await writeFile(isoFile, body, "utf-8");
      const out = await compileTsx(isoFile, isoDir);
      payloadBytes += out.outputFiles[0]?.text.length ?? 0;
      record(`${logicalId}: isolated compile (guuey deploy path)`, true, `${out.outputFiles[0]?.text.length ?? 0} bytes`);
    } catch (err) {
      record(`${logicalId}: isolated compile (guuey deploy path)`, false, String(err?.errors?.map((e) => e.text).join("; ") ?? err));
    } finally {
      await rm(isoDir, { recursive: true, force: true });
    }
  }
  record("pool push payload under 1 MiB", payloadBytes < 1024 * 1024, `compiled total ${payloadBytes} bytes`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

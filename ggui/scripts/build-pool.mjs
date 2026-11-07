#!/usr/bin/env node
/**
 * Builds the pool artifact guuey deploy reads (ggui/blueprints/manifest.json +
 * ggui/blueprints/codes/<sha256>.tsx) from the discovered ggui.ui.json manifests
 * and the variance/intent stored in ggui/registry.json. Code bodies are the
 * component.tsx sources verbatim; keys (contractHash, variantKey) are computed
 * by the protocol package and written back to registry.json. blueprintId stays
 * null until the deploy registration response is recorded by hand.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { gguiDir, importFromCli, loadProject, loadRegistry, registryEntryForUi, resolveComponentFile } from "./lib/ggui-modules.mjs";

const { toPortableBlueprint } = await importFromCli("@ggui-ai/protocol/blueprint-key");
const {
  POOL_ARTIFACT_CODES_DIR,
  POOL_ARTIFACT_MANIFEST_FILENAME,
  buildPoolArtifactManifest,
  poolArtifactCodeRef,
  serializePoolArtifactManifest,
} = await importFromCli("@ggui-ai/artifact-manifest");

const { discovery } = await loadProject();
if (discovery.issues.length > 0) {
  for (const issue of discovery.issues) console.error(`discovery issue: ${issue.path}: ${issue.message}`);
  process.exit(1);
}

const registry = await loadRegistry();
const blueprintsDir = join(gguiDir, "blueprints");
const codesDir = join(blueprintsDir, POOL_ARTIFACT_CODES_DIR);
await mkdir(codesDir, { recursive: true });
for (const stale of await readdir(codesDir)) await rm(join(codesDir, stale));

const entries = [];
for (const ui of discovery.uis.sort((a, b) => a.id.localeCompare(b.id))) {
  const { logicalId, entry } = registryEntryForUi(registry, ui.id);
  const componentFile = resolveComponentFile(ui.manifestPath, ui.manifest);
  const componentCode = await readFile(componentFile, "utf-8");
  const record = toPortableBlueprint({
    contract: ui.manifest.contract,
    componentCode,
    variance: entry.variance,
    source: { kind: "curated" },
    intent: entry.intent,
  });
  const codeRef = poolArtifactCodeRef(createHash("sha256").update(componentCode, "utf-8").digest("hex"));
  await writeFile(join(codesDir, codeRef), componentCode, "utf-8");
  const { componentCode: _omitted, ...recordWithoutCode } = record;
  entries.push({ record: recordWithoutCode, codeRef });
  entry.contractHash = record.contractHash;
  entry.variantKey = record.variantKey;
  entry.codeRef = codeRef;
  console.log(`${logicalId.padEnd(8)} ${ui.id.padEnd(16)} contractHash=${record.contractHash.slice(0, 12)} variantKey=${record.variantKey.slice(0, 12)} code=${relative(gguiDir, join(codesDir, codeRef))} (${componentCode.length} bytes)`);
}

await writeFile(join(blueprintsDir, POOL_ARTIFACT_MANIFEST_FILENAME), serializePoolArtifactManifest(buildPoolArtifactManifest(entries)), "utf-8");
await writeFile(join(gguiDir, "registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf-8");
console.log(`pool artifact: ${entries.length} blueprints -> ${relative(gguiDir, join(blueprintsDir, POOL_ARTIFACT_MANIFEST_FILENAME))}`);

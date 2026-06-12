#!/usr/bin/env node
/**
 * Validate robotscope-plugin.yaml layout ids against TypeScript manifest sources.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(repoRoot, "plugins");

function parseYamlLayouts(text) {
  const layouts = [];
  let inContributes = false;
  let inLayouts = false;

  for (const line of text.split("\n")) {
    if (/^contributes:\s*$/.test(line)) {
      inContributes = true;
      inLayouts = false;
      continue;
    }
    if (inContributes && /^  layouts:\s*$/.test(line)) {
      inLayouts = true;
      continue;
    }
    if (inLayouts) {
      const match = line.match(/^    - (.+)$/);
      if (match) {
        layouts.push(match[1].trim());
        continue;
      }
      if (/^  [A-Za-z_]+:/.test(line)) {
        inLayouts = false;
      }
    }
  }

  return layouts;
}

const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(pluginsDir, entry.name));

let errors = 0;

for (const pluginDir of pluginDirs) {
  const yamlPath = join(pluginDir, "robotscope-plugin.yaml");
  const manifestPath = join(pluginDir, "src/manifest.ts");
  let yamlLayouts;
  try {
    yamlLayouts = parseYamlLayouts(readFileSync(yamlPath, "utf8"));
  } catch {
    console.warn(`Skip ${pluginDir}: no robotscope-plugin.yaml`);
    continue;
  }

  let tsManifest;
  try {
    tsManifest = (await import(pathToFileURL(manifestPath).href)).default ??
      (await import(pathToFileURL(manifestPath).href));
  } catch (error) {
    console.error(`FAIL ${pluginDir}: cannot import manifest.ts (${error})`);
    errors += 1;
    continue;
  }

  const manifestExport =
    tsManifest.AUTOWARE_PLUGIN_MANIFEST ??
    tsManifest.NAV2_PLUGIN_MANIFEST ??
    tsManifest.MOVEIT_PLUGIN_MANIFEST ??
    tsManifest.EXAMPLE_PLUGIN_MANIFEST ??
    Object.values(tsManifest).find((value) => value?.contributes?.layouts);

  if (!manifestExport?.contributes?.layouts) {
    console.error(`FAIL ${pluginDir}: manifest.ts missing contributes.layouts`);
    errors += 1;
    continue;
  }

  const tsLayouts = [...manifestExport.contributes.layouts].sort();
  const yamlSorted = [...yamlLayouts].sort();

  if (JSON.stringify(tsLayouts) !== JSON.stringify(yamlSorted)) {
    console.error(`FAIL ${pluginDir}: layout mismatch`);
    console.error(`  yaml: ${yamlSorted.join(", ")}`);
    console.error(`  ts:   ${tsLayouts.join(", ")}`);
    errors += 1;
    continue;
  }

  console.log(`OK ${manifestExport.name} (${tsLayouts.length} layouts)`);
}

if (errors > 0) {
  process.exitCode = 1;
}

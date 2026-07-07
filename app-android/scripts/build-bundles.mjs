// Concatena shim + background.js + content script (copias em vendor/, geradas por
// sync-extension-sources.mjs) em um unico arquivo por tela, para uma unica chamada
// de evaluateJavascript com ordem garantida. Ver MainActivity.kt (as duas WebViews).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const vendorDir = path.join(appRoot, "vendor");
const shimPath = path.join(appRoot, "www", "shim", "chrome-shim.js");
const outDir = path.join(appRoot, "android", "app", "src", "main", "assets", "bundles");

function readVendorFile(name) {
  const p = path.join(vendorDir, name);
  if (!existsSync(p)) {
    throw new Error(`vendor/${name} nao existe. Rode "npm run sync-sources" antes.`);
  }
  return readFileSync(p, "utf8");
}

function readManifestVersion() {
  const manifestPath = path.join(repoRoot, "extensao-profsis", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.version || "0.0.0";
}

function buildBundle({ guardFlag, contentFileName, outFileName }) {
  const shim = readFileSync(shimPath, "utf8");
  const background = readVendorFile("background.js");
  const contentScript = readVendorFile(contentFileName);
  const version = readManifestVersion();

  const bundle = `// GERADO por scripts/build-bundles.mjs — nao editar a mao.
(function () {
  if (window.${guardFlag}) { return; }
  window.${guardFlag} = true;
  window.__PROFSIS_APP_VERSION__ = ${JSON.stringify(version)};

  ${shim}

  ${background}

  ${contentScript}
})();
`;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, outFileName), bundle, "utf8");
  console.log(`[build-bundles] gerado android/app/src/main/assets/bundles/${outFileName} (extensao v${version})`);
}

buildBundle({
  guardFlag: "__sisprofSedInjected",
  contentFileName: "content_sed.js",
  outFileName: "sed-bundle.js",
});

buildBundle({
  guardFlag: "__sisprofProfsisInjected",
  contentFileName: "content_profsis.js",
  outFileName: "profsis-bundle.js",
});

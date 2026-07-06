// Copia os arquivos-fonte da extensao Chrome (../extensao-profsis) para vendor/,
// sem nunca escrever de volta na extensao. Roda antes de todo build (ver package.json:prebuild).
//
// Se um arquivo em vendor/ tiver sido editado manualmente (hash diferente do que
// o script gravou da ultima vez que copiou), o build falha: vendor/ existe so
// para espelhar a extensao 1:1, nao para receber patches locais.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const extensionDir = path.join(repoRoot, "extensao-profsis");
const vendorDir = path.join(__dirname, "..", "vendor");

const SOURCE_FILES = ["background.js", "content_sed.js", "content_profsis.js"];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readSourceCommitHash() {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    return "unknown (git indisponivel)";
  }
}

mkdirSync(vendorDir, { recursive: true });

const hashesPath = path.join(vendorDir, ".vendor-hashes.json");
const previousHashes = existsSync(hashesPath)
  ? JSON.parse(readFileSync(hashesPath, "utf8"))
  : {};

const newHashes = {};

for (const fileName of SOURCE_FILES) {
  const srcPath = path.join(extensionDir, fileName);
  const destPath = path.join(vendorDir, fileName);

  if (!existsSync(srcPath)) {
    throw new Error(`Arquivo de origem nao encontrado: ${srcPath}`);
  }

  if (existsSync(destPath) && previousHashes[fileName]) {
    const currentDestContent = readFileSync(destPath, "utf8");
    const currentDestHash = sha256(currentDestContent);
    if (currentDestHash !== previousHashes[fileName]) {
      throw new Error(
        `vendor/${fileName} foi editado manualmente (hash nao bate com a ultima copia). ` +
          `Reverta a edicao manual e mude o original em extensao-profsis/${fileName} se necessario.`
      );
    }
  }

  const content = readFileSync(srcPath, "utf8");
  writeFileSync(destPath, content, "utf8");
  newHashes[fileName] = sha256(content);
}

writeFileSync(hashesPath, JSON.stringify(newHashes, null, 2), "utf8");
writeFileSync(
  path.join(vendorDir, "SOURCE_COMMIT.txt"),
  `${readSourceCommitHash()}\n`,
  "utf8"
);

console.log(`[sync-extension-sources] ${SOURCE_FILES.length} arquivo(s) sincronizado(s) de extensao-profsis/ para vendor/.`);

/**
* extract.js
* Combines project files into a single text file in the repo root.
*
* Usage:
*   node extract.js
*
* Output:
*   application_code_dump.txt  (in repo root)
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUTPUT_FILE = path.join(ROOT, "application_code_dump.txt");

// Folders to skip (common big/derived dirs)
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".nx",
  ".cache",
  ".idea",
]);

const INCLUDE_EXT = new Set([
  // JavaScript / TypeScript
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",

  // Config & tooling
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",

  // React / UI
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",

  // Docs & text
  ".md",
  ".mdx",
  ".txt",

  // Testing
  ".spec.ts",
  ".spec.tsx",
  ".test.ts",
  ".test.tsx",

  // Environment & misc
  ".env",
  ".env.local",
  ".env.example",
  ".gitignore",
  ".babelrc",
  ".editorconfig",
  ".prettierrc",
  ".eslintignore",
  ".eslintrc",

  // Build / tooling scripts
  ".sh",
  ".sql",
]);


// Specific filenames to include even without extension match
const INCLUDE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "nx.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "vitest.workspace.ts",
  "README.md",
  "PROJECT_GUIDELINES.md",
  "AGENTS.md",
]);

// Skip the output itself and this script
const SKIP_FILES = new Set([
  path.basename(OUTPUT_FILE),
  "extract.js",
  "extarct.js", // in case you name it with the typo
  "package-lock.json", // ❌ explicitly ignored

]);

function isTextFile(filePath) {
  const base = path.basename(filePath);
  const ext = path.extname(base);

  if (INCLUDE_FILES.has(base)) return true;
  if (INCLUDE_EXT.has(ext)) return true;

  // Also include dotfiles like ".env" which have no ext
  if (base.startsWith(".") && INCLUDE_EXT.has(base)) return true;

  return false;
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);

    // Skip output/script
    if (entry.isFile() && SKIP_FILES.has(entry.name)) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, files);
    } else if (entry.isFile()) {
      if (isTextFile(full)) files.push(full);
    }
  }
  return files;
}

function safeRead(filePath) {
  // Avoid huge files
  const stat = fs.statSync(filePath);
  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (stat.size > maxBytes) {
    return `<<SKIPPED: File too large (${stat.size} bytes)>>`;
  }

  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return `<<SKIPPED: Could not read as UTF-8 (${e.message})>>`;
  }
}

function main() {
  const allFiles = walk(ROOT);

  // Sort for stable output
  allFiles.sort((a, b) => a.localeCompare(b));

  let out = "";
  out += `# Project Code Dump\n`;
  out += `# Root: ${ROOT}\n`;
  out += `# Generated: ${new Date().toISOString()}\n`;
  out += `# Files included: ${allFiles.length}\n\n`;

  for (const filePath of allFiles) {
    const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const content = safeRead(filePath);

    out += `\n\n===== FILE: ${rel} =====\n`;
    out += content;
    if (!content.endsWith("\n")) out += "\n";
  }

  fs.writeFileSync(OUTPUT_FILE, out, "utf8");
  console.log(`✅ Done. Wrote: ${path.relative(ROOT, OUTPUT_FILE)} (${allFiles.length} files)`);
}

main();
 
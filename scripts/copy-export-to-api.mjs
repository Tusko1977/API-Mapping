// Copies the static export (./out, produced by `next build` with
// output: "export" in next.config.mjs) into api/wwwroot, where
// api/Program.cs serves it as static files. Run via `npm run build:iis`.
//
// Node's fs.cp instead of a shell `cp`/`xcopy` so this works the same on
// Windows and elsewhere without extra tooling.

import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "out");
const dest = path.join(root, "api", "wwwroot");

if (!existsSync(source)) {
  console.error(`Nothing to copy - ${source} does not exist. Run "next build" first.`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await cp(source, dest, { recursive: true });

console.log(`Copied ${source} -> ${dest}`);

import console from "node:console";
import process from "node:process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (entry.name.endsWith(".md")) files.push(file);
  }
}
await collect(path.join(root, "docs"));
for (const entry of await readdir(root)) {
  if (entry.endsWith(".md")) files.push(path.join(root, entry));
}
const broken = [];
for (const file of files) {
  const content = (await readFile(file, "utf8")).replace(/```[\s\S]*?```/g, "");
  for (const match of content.matchAll(/\]\(([^\n)]+)\)/g)) {
    const target = match[1]
      .trim()
      .split(/\s+["']/)[0]
      .replace(/^<|>$/g, "");
    if (/^(?:[a-z]+:|#|\/)/i.test(target)) continue;
    const relative = decodeURIComponent(target.split("#")[0]);
    if (!relative) continue;
    try {
      await access(path.resolve(path.dirname(file), relative));
    } catch {
      broken.push({ file: path.relative(root, file), target });
    }
  }
}
console.log(JSON.stringify({ markdownFiles: files.length, brokenLocalLinks: broken }, null, 2));
process.exitCode = broken.length ? 1 : 0;

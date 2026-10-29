import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isBuiltin } from "node:module";
import ts from "typescript";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = ["core", "router", "shared", "sync"];
const projects = [
  ...modules.map((name) => `packages/${name}`),
  "apps/cli",
  "apps/mcp-server",
  "apps/web",
];
const excludedSources = new Set([path.join("apps", "mcp-server", "src", "http.ts")]);

export function isDistributionSource(relativePath) {
  return (
    relativePath.endsWith(".ts") &&
    !relativePath.endsWith(".test.ts") &&
    !relativePath.endsWith(".d.ts") &&
    !excludedSources.has(relativePath)
  );
}

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Distribution inputs must not be symbolic links");
    if (entry.isDirectory()) files.push(...(await filesIn(file)));
    else if (entry.isFile()) files.push(file);
    else throw new Error("Distribution inputs must be regular files");
  }
  return files.sort();
}

// Parse module specifiers instead of rewriting comments, strings, or Skill instructions.
function relocateImports(text, filename, dependencies) {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edits = [];
  const inspect = (specifier) => {
    const value = specifier.text;
    if (value.startsWith("@skill-hub/")) {
      if (!modules.includes(value.slice("@skill-hub/".length))) {
        throw new Error(`Unmapped workspace import: ${value}`);
      }
      edits.push({
        start: specifier.getStart(source),
        end: specifier.end,
        text: JSON.stringify(value.replace("@skill-hub/", "#skill-hub/")),
      });
    } else if (!value.startsWith(".") && !isBuiltin(value)) {
      const name = value.startsWith("@")
        ? value.split("/").slice(0, 2).join("/")
        : value.split("/")[0];
      if (!Object.hasOwn(dependencies, name))
        throw new Error(`Undeclared distribution dependency: ${name}`);
    }
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      inspect(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))
        throw new Error("Dynamic distribution import requires a literal");
      inspect(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--name"))
    throw new Error("Usage: pnpm pack:npm [--name <package-name>]");
  const sourceManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const name = args[1] ?? sourceManifest.name;
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || name.length > 214)
    throw new Error("Invalid distribution package name");
  await exec("pnpm", ["build"], { cwd: root, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const manifests = await Promise.all(
    projects.map(async (project) =>
      JSON.parse(await readFile(path.join(root, project, "package.json"), "utf8")),
    ),
  );
  const dependencies = {};
  for (const manifest of manifests) {
    if (manifest.version !== sourceManifest.version)
      throw new Error("Workspace versions must match the distribution version");
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (dependency.startsWith("@skill-hub/")) continue;
      if (Object.hasOwn(dependencies, dependency) && dependencies[dependency] !== version)
        throw new Error(`Dependency version conflict: ${dependency}`);
      dependencies[dependency] = version;
    }
  }
  await mkdir(path.join(root, "outputs"), { recursive: true });
  const output = await mkdtemp(path.join(root, "outputs", "npm-"));
  const stage = path.join(output, "package");
  await mkdir(stage);
  const copy = async (relative, contents) => {
    const target = path.join(stage, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents ?? (await readFile(path.join(root, relative))));
  };
  // Only emit JS corresponding to current production sources; stale dist files cannot enter the tarball.
  for (const project of projects) {
    for (const source of await filesIn(path.join(root, project, "src"))) {
      const sourcePath = path.relative(root, source);
      if (!isDistributionSource(sourcePath)) continue;
      const relative = path.join(
        project,
        "dist",
        path.relative(path.join(root, project, "src"), source).replace(/\.ts$/, ".js"),
      );
      const code = await readFile(path.join(root, relative), "utf8");
      await copy(
        relative,
        relocateImports(code.replace(/^\/\/# sourceMappingURL=.*$/gm, ""), relative, dependencies),
      );
    }
  }
  for (const directory of ["apps/web/public"]) {
    for (const file of await filesIn(path.join(root, directory)))
      await copy(path.relative(root, file));
  }
  for (const file of [
    "scripts/opencode-hub.mjs",
    "configs/agents/default.yaml",
    "configs/profiles/coding.yaml",
    "configs/profiles/video.yaml",
    "configs/models.yaml",
    "configs/taxonomy.yaml",
  ])
    await copy(file);
  for (const file of ["LICENSE", "NOTICE.md"]) await copy(file);
  await copy("README.md", await readFile(path.join(root, "docs/ops/NPM_PACKAGE_README.md")));
  const bin = {
    "skill-hub": "apps/cli/dist/index.js",
    "skill-hub-mcp": "apps/mcp-server/dist/index.js",
    "skill-hub-web": "apps/web/dist/index.js",
    "skill-hub-opencode": "scripts/opencode-hub.mjs",
  };
  const manifest = {
    name,
    version: sourceManifest.version,
    description: sourceManifest.description,
    type: "module",
    license: sourceManifest.license,
    engines: sourceManifest.engines,
    repository: sourceManifest.repository,
    bugs: sourceManifest.bugs,
    homepage: sourceManifest.homepage,
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
    bin,
    imports: Object.fromEntries(
      modules.map((module) => [`#skill-hub/${module}`, `./packages/${module}/dist/index.js`]),
    ),
    files: [
      "apps/*/dist/**/*.js",
      "scripts/opencode-hub.mjs",
      "apps/web/public",
      "packages/*/dist/**/*.js",
      "configs",
      "NOTICE.md",
    ],
    dependencies,
  };
  await copy("package.json", JSON.stringify(manifest, null, 2) + "\n");
  for (const file of Object.values(bin)) await chmod(path.join(stage, file), 0o755);
  const { stdout } = await exec(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", output],
    { cwd: stage, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const [packed] = JSON.parse(stdout);
  await writeFile(path.join(output, "pack-report.json"), JSON.stringify(packed, null, 2) + "\n");
  console.log(
    JSON.stringify({
      name,
      version: manifest.version,
      tarball: path.join(output, packed.filename),
      integrity: packed.integrity,
      files: packed.files.length,
      size: packed.size,
      published: false,
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

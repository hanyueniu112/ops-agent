import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export function workspaceRoot() {
  return path.resolve(process.cwd(), "workspace");
}

export async function ensureWorkspace() {
  await mkdir(workspaceRoot(), { recursive: true });
}

export function resolveWorkspacePath(relativePath: string) {
  const root = workspaceRoot();
  const resolved = path.resolve(root, relativePath || ".");
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("路径超出工作区范围");
  }
  return resolved;
}

export async function listWorkspace(relativePath = ".") {
  await ensureWorkspace();
  const dir = resolveWorkspacePath(relativePath);
  const entries = await readdir(dir, { withFileTypes: true });
  const items = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      const info = await stat(full);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: info.size,
        path: path.relative(workspaceRoot(), full).replaceAll("\\", "/"),
      };
    }),
  );
  return items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export async function readWorkspaceFile(relativePath: string, maxChars = 12000) {
  await ensureWorkspace();
  const file = resolveWorkspacePath(relativePath);
  const content = await readFile(file, "utf8");
  if (content.length <= maxChars) {
    return { path: relativePath, content, truncated: false };
  }
  return {
    path: relativePath,
    content: content.slice(0, maxChars),
    truncated: true,
    totalChars: content.length,
  };
}

export async function writeWorkspaceFile(relativePath: string, content: string) {
  await ensureWorkspace();
  const file = resolveWorkspacePath(relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return { path: relativePath, bytes: Buffer.byteLength(content, "utf8") };
}

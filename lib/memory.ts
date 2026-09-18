import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { workspaceRoot } from "@/lib/workspace";

export function opsDir() {
  return path.join(workspaceRoot(), ".ops");
}

export function memoryFile() {
  return path.join(opsDir(), "MEMORY.md");
}

export function dreamsFile() {
  return path.join(opsDir(), "DREAMS.md");
}

export async function ensureOpsDir() {
  await mkdir(opsDir(), { recursive: true });
}

export async function readMemoryMarkdown() {
  try {
    return await readFile(memoryFile(), "utf8");
  } catch {
    return "";
  }
}

export async function writeMemoryMarkdown(content: string) {
  await ensureOpsDir();
  await writeFile(memoryFile(), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

export async function appendDreamDiary(entry: string) {
  await ensureOpsDir();
  const previous = await readFile(dreamsFile(), "utf8").catch(() => "# Dream 日记\n\n");
  await writeFile(dreamsFile(), `${previous.trim()}\n\n${entry.trim()}\n`, "utf8");
}

export async function readDreamDiary() {
  try {
    return await readFile(dreamsFile(), "utf8");
  } catch {
    return "";
  }
}

export async function memoryPromptSnippet() {
  const text = (await readMemoryMarkdown()).trim();
  if (!text) return "";
  return text.slice(0, 4000);
}

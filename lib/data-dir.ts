import { mkdirSync } from "node:fs";
import path from "node:path";

export function dataDir() {
  const fromEnv = process.env.OPS_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "data");
}

export function ensureDataDir() {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function sqlitePath() {
  return path.join(ensureDataDir(), "ops.sqlite");
}

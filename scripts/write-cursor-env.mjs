import { Cursor } from "@cursor/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const authPath = path.join(homedir(), ".cursor", "sdk", "auth.json");
const auth = JSON.parse(readFileSync(authPath, "utf8"));
const apiKey = auth.apiKey || auth.accessToken || auth.key;
if (!apiKey) {
  throw new Error("auth.json missing apiKey fields: " + Object.keys(auth).join(","));
}

const envPath = path.join(process.cwd(), ".env.local");
const env = [
  "CURSOR_API_KEY=" + apiKey,
  "CURSOR_MODEL=grok-4.6",
  "CURSOR_MODEL_EFFORT=high",
  "CURSOR_MODEL_FAST=true",
].join("\n") + "\n";
writeFileSync(envPath, env, "utf8");
console.log("WROTE_ENV");

const models = await Cursor.models.list({ apiKey });
const ids = models.map((m) => m.id);
console.log("MODELS " + ids.join(","));
const grok = models.find((m) => m.id === "grok-4.6");
console.log("HAS_GROK_46 " + Boolean(grok));
if (grok?.parameters) {
  console.log("GROK_PARAMS " + grok.parameters.map((p) => p.id).join(","));
}

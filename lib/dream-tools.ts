import type { SDKCustomTool } from "@cursor/sdk";
import { readDreamDiary, readMemoryMarkdown } from "@/lib/memory";
import { dreamStatus, runDreamCycle } from "@/lib/dream";

export function dreamCustomTools(): Record<string, SDKCustomTool> {
  return {
    read_memory: {
      description: "读取 Dream 深睡沉淀的长期记忆（workspace/.ops/MEMORY.md）。只来自公共会话。",
      inputSchema: { type: "object", properties: { unused: { type: "string" } } },
      annotations: { title: "读取长期记忆", readOnlyHint: true },
      execute: async () => ({ markdown: await readMemoryMarkdown() }),
    },
    read_dreams: {
      description: "读取 Dream REM 日记（workspace/.ops/DREAMS.md）。",
      inputSchema: { type: "object", properties: { unused: { type: "string" } } },
      annotations: { title: "读取梦境日记", readOnlyHint: true },
      execute: async () => ({ markdown: await readDreamDiary() }),
    },
    run_dream: {
      description: "立刻跑一轮 Dream：浅睡筛公共会话 → REM 写日记 → 深睡写入 MEMORY.md。个人会话不会被扫描。",
      inputSchema: { type: "object", properties: { unused: { type: "string" } } },
      annotations: { title: "立刻整理记忆" },
      execute: async () => {
        const run = await runDreamCycle("manual");
        return { run, status: await dreamStatus() };
      },
    },
  };
}

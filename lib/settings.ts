export type AgentSettings = {
  preset: string;
  apiKey: string;
  baseURL: string;
  model: string;
};

export const PROVIDER_PRESETS = [
  {
    id: "cursor",
    name: "Cursor",
    baseURL: "cursor://agent",
    model: "grok-4.6",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "moonshot",
    name: "Kimi",
    baseURL: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-auto",
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    baseURL: "",
    model: "",
  },
] as const;

export const DEFAULT_SETTINGS: AgentSettings = {
  preset: "cursor",
  apiKey: "",
  baseURL: "cursor://agent",
  model: "grok-4.6",
};

const SETTINGS_KEY = "weave-agent-settings";

export function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AgentSettings;
    if (!parsed.apiKey && parsed.preset !== "cursor" && parsed.preset !== "custom") {
      return DEFAULT_SETTINGS;
    }
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AgentSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

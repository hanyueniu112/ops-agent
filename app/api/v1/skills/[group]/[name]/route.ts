import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { readSkill, type SkillScope } from "@/lib/skills";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ group: string; name: string }> };

export function OPTIONS() {
  return optionsApi();
}

export async function GET(req: Request, context: RouteContext) {
  northboundActor();
  const { group, name } = await context.params;
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") || "project") as SkillScope;
  if (scope !== "project" && scope !== "personal") return errorApi("scope 只能是 project 或 personal", 400);
  try {
    const skill = await readSkill(scope, name, url.searchParams.get("file") || "SKILL.md", group);
    return jsonApi({
      scope: skill.scope,
      group: skill.group,
      name: skill.name,
      fileName: skill.fileName,
      files: skill.files,
      content: skill.content,
    });
  } catch (error) {
    return errorApi(error instanceof Error ? error.message : "读取失败", 404);
  }
}

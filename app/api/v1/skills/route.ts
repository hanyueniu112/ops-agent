import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { listSkills, readGroups } from "@/lib/skills";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsApi();
}

export async function GET(req: Request) {
  northboundActor();
  const url = new URL(req.url);
  const group = url.searchParams.get("group");
  const scope = url.searchParams.get("scope");
  let skills = await listSkills(scope === "personal" || scope === "project" ? scope : undefined);
  if (group) skills = skills.filter((item) => item.group === group);
  return jsonApi({
    skills: skills.map((item) => ({
      scope: item.scope,
      group: item.group,
      name: item.name,
      description: item.description,
      path: item.path,
    })),
    groups: {
      project: await readGroups("project"),
      personal: await readGroups("personal"),
    },
  });
}

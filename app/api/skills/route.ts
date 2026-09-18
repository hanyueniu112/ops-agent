import { userFromRequest } from "@/lib/auth";
import {
  createGroup,
  createSkill,
  deleteGroup,
  deleteSkill,
  listSkills,
  readGroups,
  readSkill,
  writeSkill,
  type SkillScope,
} from "@/lib/skills";

export const runtime = "nodejs";

function asScope(value: unknown): SkillScope {
  if (value === "personal" || value === "project") return value;
  throw new Error("scope 只能是 project 或 personal");
}

function unauthorized() {
  return Response.json({ error: "未登录" }, { status: 401 });
}

async function groupsPayload() {
  return {
    project: await readGroups("project"),
    personal: await readGroups("personal"),
  };
}

export async function GET(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  try {
    if (!name) {
      return Response.json({
        skills: await listSkills(),
        groups: await groupsPayload(),
      });
    }
    const scope = asScope(url.searchParams.get("scope") || "project");
    const fileName = url.searchParams.get("file") || "SKILL.md";
    const group = url.searchParams.get("group") || "general";
    return Response.json(await readSkill(scope, name, fileName, group));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  try {
    const body = (await req.json()) as {
      scope?: string;
      name?: string;
      description?: string;
      group?: string;
    };
    const result = await createSkill(
      asScope(body.scope || "project"),
      body.name || "",
      body.description || "",
      body.group || "general",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建失败" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  try {
    const body = (await req.json()) as {
      scope?: string;
      name?: string;
      content?: string;
      file?: string;
      group?: string;
    };
    if (typeof body.content !== "string") {
      throw new Error("缺少 content");
    }
    const result = await writeSkill(
      asScope(body.scope || "project"),
      body.name || "",
      body.content,
      body.file || "SKILL.md",
      body.group || "general",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  try {
    const body = (await req.json()) as {
      action?: string;
      scope?: string;
      id?: string;
      title?: string;
      description?: string;
    };
    const scope = asScope(body.scope || "project");
    if (body.action === "create_group") {
      const group = await createGroup(scope, {
        id: body.id || "",
        title: body.title || "",
        description: body.description,
      });
      return Response.json({ group, groups: await groupsPayload() });
    }
    if (body.action === "delete_group") {
      await deleteGroup(scope, body.id || "");
      return Response.json({ ok: true, groups: await groupsPayload() });
    }
    throw new Error("不支持的操作");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "分组失败" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  const url = new URL(req.url);
  try {
    const result = await deleteSkill(
      asScope(url.searchParams.get("scope") || "project"),
      url.searchParams.get("name") || "",
      url.searchParams.get("group") || "general",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}

import {
  createSkill,
  deleteSkill,
  listSkills,
  readSkill,
  writeSkill,
  type SkillScope,
} from "@/lib/skills";

function asScope(value: unknown): SkillScope {
  if (value === "personal" || value === "project") return value;
  throw new Error("scope 只能是 project 或 personal");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  try {
    if (!name) {
      return Response.json({ skills: await listSkills() });
    }
    const scope = asScope(url.searchParams.get("scope") || "project");
    const fileName = url.searchParams.get("file") || "SKILL.md";
    return Response.json(await readSkill(scope, name, fileName));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      scope?: string;
      name?: string;
      description?: string;
    };
    const result = await createSkill(
      asScope(body.scope || "project"),
      body.name || "",
      body.description || "",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建失败" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      scope?: string;
      name?: string;
      content?: string;
      file?: string;
    };
    if (typeof body.content !== "string") {
      throw new Error("缺少 content");
    }
    const result = await writeSkill(
      asScope(body.scope || "project"),
      body.name || "",
      body.content,
      body.file || "SKILL.md",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  try {
    const result = await deleteSkill(
      asScope(url.searchParams.get("scope") || "project"),
      url.searchParams.get("name") || "",
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 });
  }
}

import {
  clearCookieHeader,
  cookieHeader,
  createUser,
  findUserByUsername,
  hashPassword,
  issueToken,
  normalizeUsername,
  readTokenFromRequest,
  revokeToken,
  userFromRequest,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

function errorJson(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(req: Request) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  return Response.json({ user });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    username?: string;
    password?: string;
  };
  const action = body.action === "register" ? "register" : body.action === "logout" ? "logout" : "login";

  if (action === "logout") {
    const token = readTokenFromRequest(req);
    if (token) revokeToken(token);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearCookieHeader(),
      },
    });
  }

  const username = normalizeUsername(body.username || "");
  const password = body.password || "";
  const usernameError = validateUsername(username);
  if (usernameError) return errorJson(usernameError, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return errorJson(passwordError, 400);

  try {
    if (action === "register") {
      if (findUserByUsername(username)) return errorJson("用户名已被占用", 409);
      const user = createUser(username, await hashPassword(password));
      const token = issueToken(user.id);
      return new Response(JSON.stringify({ user }), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieHeader(token),
        },
      });
    }

    const found = findUserByUsername(username);
    if (!found || !(await verifyPassword(password, found.password_hash))) {
      return errorJson("用户名或密码不对", 401);
    }
    const token = issueToken(found.id);
    return new Response(JSON.stringify({ user: { id: found.id, username: found.username } }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieHeader(token),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    if (message.includes("UNIQUE")) return errorJson("用户名已被占用", 409);
    return errorJson(message, 500);
  }
}

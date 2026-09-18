"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "登录失败");
        return;
      }
      const next = searchParams.get("next") || "/";
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("网络异常");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">脑</span>
          <div>
            <div className="brand-name">OPS大脑</div>
            <div className="brand-sub">AIOPS Web 智能体</div>
          </div>
        </div>
        <h1>{mode === "login" ? "登录平台" : "创建账号"}</h1>
        <p className="dialog-copy">
          会话存在服务器 SQLite 里。公共会话所有登录用户都能看到；个人会话只有自己能看。
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            用户名
            <input
              value={username}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="error-line">{error}</p> : null}
          <button className="send-btn dialog-save" type="submit" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </form>
        <button
          type="button"
          className="ghost-btn login-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </div>
  );
}

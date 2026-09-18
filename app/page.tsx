"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  lastActiveId,
  loadSessions,
  newSession,
  saveSessions,
  sessionPath,
} from "@/lib/sessions";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const stored = loadSessions();
    const saved = lastActiveId();
    const existing = stored.find((session) => session.id === saved) || stored[0];
    if (existing) {
      router.replace(sessionPath(existing.id));
      return;
    }
    const session = newSession();
    saveSessions([session], session.id);
    router.replace(sessionPath(session.id));
  }, [router]);

  return <div className="app-shell" />;
}

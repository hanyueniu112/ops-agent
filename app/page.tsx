"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createSession,
  lastRememberedSession,
  listSessions,
  migrateLegacySessions,
  sessionPath,
} from "@/lib/sessions";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      await migrateLegacySessions();
      const sessions = await listSessions();
      const remembered = lastRememberedSession();
      const existing = sessions.find((session) => session.id === remembered) || sessions[0];
      if (existing) {
        router.replace(sessionPath(existing.id));
        return;
      }
      const session = await createSession({ visibility: "personal" });
      router.replace(sessionPath(session.id));
    })();
  }, [router]);

  return <div className="app-shell" />;
}

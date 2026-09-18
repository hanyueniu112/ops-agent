"use client";

import { AgentApp } from "@/components/agent-app";

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AgentApp />
      {children}
    </>
  );
}

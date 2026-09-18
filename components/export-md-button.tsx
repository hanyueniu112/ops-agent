"use client";

import { useState } from "react";

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim() || "正文";
}

export function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown.endsWith("\n") ? markdown : `${markdown}\n`], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const name = safeFileName(filename);
  anchor.href = url;
  anchor.download = name.endsWith(".md") ? name : `${name}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMdButton({
  markdown,
  filename,
}: {
  markdown: string;
  filename: string;
}) {
  const [done, setDone] = useState(false);
  if (!markdown.trim()) return null;

  return (
    <button
      type="button"
      className="export-md"
      onClick={() => {
        downloadMarkdown(filename, markdown);
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "已导出" : "导出 MD"}
    </button>
  );
}

"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

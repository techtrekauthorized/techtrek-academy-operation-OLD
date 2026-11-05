"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type StudentCertificateDownloadButtonProps = {
  href: string;
  filename: string;
  label: string;
  loadingLabel: string;
  errorMessage: string;
  icon: ReactNode;
  className: string;
};

export function StudentCertificateDownloadButton({ href, filename, label, loadingLabel, errorMessage, icon, className }: StudentCertificateDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function downloadFile() {
    setError("");
    setDownloading(true);
    try {
      const response = await fetch(href, { credentials: "include" });
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      if (!blob.size) throw new Error("empty download");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      setError(errorMessage);
    } finally {
      setDownloading(false);
    }
  }

  return <div className="min-w-0">
    <button type="button" disabled={downloading} onClick={() => void downloadFile()} className={`${className} disabled:pointer-events-none disabled:opacity-60`}>
      {icon}{downloading ? loadingLabel : label}
    </button>
    {error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : null}
  </div>;
}

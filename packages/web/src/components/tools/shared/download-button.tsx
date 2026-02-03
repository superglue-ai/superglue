import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { downloadJson } from "@/src/lib/download-utils";
import { maskCredentials, safeStringify } from "@superglue/shared";

interface DownloadButtonProps {
  data: any;
  filename: string;
  credentials?: Record<string, string>;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function DownloadButton({
  data,
  filename,
  credentials,
  disabled = false,
  className = "h-6 w-6",
  title = "Download as JSON",
}: DownloadButtonProps) {
  const handleDownload = () => {
    const content = typeof data === "string" ? data : safeStringify(data, 2);
    const masked =
      credentials && Object.keys(credentials).length > 0
        ? maskCredentials(content, credentials)
        : content;
    downloadJson(masked, filename);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={handleDownload}
      disabled={disabled || data === undefined}
      title={title}
    >
      <Download className="h-3 w-3" />
    </Button>
  );
}

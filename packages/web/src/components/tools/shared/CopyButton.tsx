import { Check, Copy } from "lucide-react";
import { useState } from "react";

export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback:", err);
    }
  }

  const textArea = document.createElement("textarea");
  try {
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    return successful;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  } finally {
    textArea.remove();
  }
};

export const CopyButton = ({ text, getData }: { text?: string; getData?: () => any }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const textToCopy = getData
      ? typeof getData() === "string"
        ? getData()
        : JSON.stringify(getData(), null, 2)
      : text || "";
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors backdrop-blur"
      title="Copy"
      type="button"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
};

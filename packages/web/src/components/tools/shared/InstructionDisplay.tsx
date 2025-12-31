import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Eye, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "./CopyButton";

export const InstructionDisplay = ({
  instruction,
  onEdit,
  showEditButton = true,
}: {
  instruction: string;
  onEdit?: () => void;
  showEditButton?: boolean;
}) => {
  const [showFull, setShowFull] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const normalizedText = instruction.replace(/\n/g, " ");

  useEffect(() => {
    if (textRef.current) {
      const element = textRef.current;
      setIsTruncated(element.scrollHeight > element.clientHeight);
    }
  }, [normalizedText]);

  return (
    <>
      <div className="max-w-[75%]">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-[13px]">Tool Instruction</h3>
          {isTruncated && (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => setShowFull(true)}
              title="View full instruction"
            >
              <Eye className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
        <p ref={textRef} className="text-[13px] text-muted-foreground line-clamp-2">
          {normalizedText}
        </p>
      </div>
      {showFull && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowFull(false)}
        >
          <Card
            className="max-w-3xl w-full max-h-[80vh] overflow-hidden bg-background border-border/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Tool Instruction</h3>
                <div className="flex items-center gap-2">
                  <CopyButton text={instruction} />
                  <Button variant="ghost" size="icon" onClick={() => setShowFull(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                <p className="text-sm font-mono whitespace-pre-wrap">{instruction}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

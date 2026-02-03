import { Pencil, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "./CopyButton";

export const InstructionDisplay = ({
  instruction,
  onSave,
  showEditButton = true,
}: {
  instruction: string;
  onSave?: (newInstruction: string) => void;
  showEditButton?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(instruction);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(instruction);
  }, [instruction]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    onSave?.(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(instruction);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Enter" && e.metaKey) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className="group">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-foreground/70">Tool Instruction</span>
        </div>
        <div className="relative rounded-lg border shadow-sm bg-muted/30">
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[72px] text-[13px] border-0 bg-transparent shadow-none resize-y focus:outline-none focus:ring-0 px-3 py-2 pr-20"
            placeholder="Describe what this tool should do..."
          />
          <div className="absolute top-1 right-1 flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-green-500/20 text-green-600"
              title="Save (⌘+Enter)"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-red-500/20 text-red-600"
              title="Cancel (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-foreground/70">Tool Instruction</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {showEditButton && onSave && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-muted"
              title="Edit instruction"
            >
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          )}
          <CopyButton text={instruction} className="h-5 w-5" />
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
        {instruction || <span className="italic">No instruction set</span>}
      </p>
    </div>
  );
};

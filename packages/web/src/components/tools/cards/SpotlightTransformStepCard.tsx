import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { type ToolStep } from "@superglue/shared";
import { Maximize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { JavaScriptCodeEditor } from "../../editors/JavaScriptCodeEditor";
import { TemplateEditPopover } from "../templates/TemplateEditPopover";

interface SpotlightTransformStepCardProps {
  step: ToolStep;
  onImmediateEdit: (updater: (s: ToolStep) => ToolStep) => void;
}

const LINE_HEIGHT_PX = 18;
const EDITOR_PADDING_PX = 24;
const CHARS_PER_LINE_ESTIMATE = 90;
const MIN_CODE_HEIGHT_PX = 120;
const MAX_CODE_HEIGHT_PX = 280;

const calcCodeHeight = (content: string): number => {
  const lines = (content || "").split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE_ESTIMATE));
  }
  const height = totalLines * LINE_HEIGHT_PX + EDITOR_PADDING_PX;
  return Math.max(MIN_CODE_HEIGHT_PX, Math.min(MAX_CODE_HEIGHT_PX, height));
};

export function SpotlightTransformStepCard({
  step,
  onImmediateEdit,
}: SpotlightTransformStepCardProps) {
  const transformCode = step.config?.type === "transform" ? step.config.transformCode : "";
  const [localTransform, setLocalTransform] = useState(transformCode || "");

  useEffect(() => {
    setLocalTransform(transformCode || "");
  }, [transformCode]);

  const handleTransformChange = (value: string) => {
    setLocalTransform(value);
    onImmediateEdit((s) => ({
      ...s,
      config: {
        ...(s.config || {}),
        type: "transform",
        transformCode: value,
      },
    }));
  };

  const trimmedTransform = localTransform.trim();
  const templateString = trimmedTransform.startsWith("<<")
    ? trimmedTransform
    : `<<${trimmedTransform}>>`;

  const codeEditorHeight = useMemo(() => `${calcCodeHeight(localTransform)}px`, [localTransform]);

  const handleTemplateUpdate = (newTemplate: string) => {
    const cleaned = newTemplate.replace(/^<<|>>$/g, "");
    handleTransformChange(cleaned);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Transform Code</Label>
          <TemplateEditPopover
            template={templateString}
            onSave={handleTemplateUpdate}
            stepId={step.id}
            startFullscreen={true}
            title="Transform Code"
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Expand transform editor"
              title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TemplateEditPopover>
        </div>
        <JavaScriptCodeEditor
          value={localTransform}
          onChange={handleTransformChange}
          minHeight="120px"
          maxHeight={codeEditorHeight}
          resizable={false}
          isTransformEditor={true}
          autoFormatOnMount={true}
        />
      </div>
    </div>
  );
}

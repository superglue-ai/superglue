import { useEditor, EditorContent } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { cn } from "@/src/lib/general-utils";
import { useEffect, useRef, useCallback } from "react";
import { useExecution } from "../tools/context/tool-execution-context";
import { TemplateExtension } from "../tools/templates/TemplateExtension";
import { VariableSuggestion } from "../tools/templates/TemplateVariableSuggestion";
import { TemplateEditPopover } from "../tools/templates/TemplateEditPopover";
import { templateStringToTiptap, tiptapToTemplateString } from "@/src/lib/templating-utils";
import { useTemplateAwareEditor } from "../tools/hooks/use-template-aware-editor";

interface TemplateAwareTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  stepId: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const SingleLineDocument = Document.extend({ content: "paragraph" });

const DEBOUNCE_MS = 200;

export function TemplateAwareTextEditor({
  value,
  onChange,
  stepId,
  placeholder,
  className,
  disabled = false,
}: TemplateAwareTextEditorProps) {
  const { getStepTemplateData } = useExecution();
  const { categorizedVariables, categorizedSources } = getStepTemplateData(stepId);

  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedOnChange = useCallback(
    (newValue: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(newValue), DEBOUNCE_MS);
    },
    [onChange],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const {
    suggestionConfig,
    codePopoverOpen,
    setCodePopoverOpen,
    popoverAnchorRect,
    handleCodeSave,
    editorRef,
    cleanupSuggestion,
  } = useTemplateAwareEditor({ categorizedVariables, categorizedSources });

  useEffect(() => cleanupSuggestion, [cleanupSuggestion]);

  const editor = useEditor({
    extensions: [
      SingleLineDocument,
      Paragraph,
      Text,
      History,
      TemplateExtension.configure({ stepId }),
      VariableSuggestion.configure({ suggestion: suggestionConfig }),
    ],
    content: templateStringToTiptap(value),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "w-full min-h-9 px-3 py-2 text-xs font-mono rounded-lg border bg-muted/30 shadow-sm",
          "focus:outline-none overflow-x-auto overflow-y-hidden scrollbar-thin",
          disabled && "opacity-50 cursor-not-allowed",
        ),
        style: "line-height: 20px;",
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      const newValue = tiptapToTemplateString(editor.getJSON());
      if (newValue !== lastValueRef.current) {
        lastValueRef.current = newValue;
        debouncedOnChange(newValue);
      }
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor || value === lastValueRef.current) return;
    isUpdatingRef.current = true;
    lastValueRef.current = value;
    queueMicrotask(() => {
      editor.commands.setContent(templateStringToTiptap(value));
      isUpdatingRef.current = false;
    });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className={cn("relative flex-1 min-w-0", className)}>
      <EditorContent
        editor={editor}
        className={cn(
          "[&_.tiptap]:outline-none [&_.tiptap]:w-full",
          "[&_.tiptap>p]:inline [&_.tiptap>p]:!whitespace-nowrap [&_.tiptap>p]:m-0",
          "[&_.react-renderer]:!whitespace-nowrap [&_.react-renderer]:inline",
          "[&_[data-node-view-wrapper]]:!inline [&_[data-node-view-wrapper]]:!whitespace-nowrap",
          "[&_.ProseMirror-separator]:!hidden [&_br.ProseMirror-trailingBreak]:!hidden",
        )}
      />
      {!value?.trim() && placeholder && (
        <div className="absolute top-2 left-3 text-muted-foreground text-xs pointer-events-none font-mono">
          {placeholder}
        </div>
      )}
      <TemplateEditPopover
        template=""
        onSave={handleCodeSave}
        stepId={stepId}
        externalOpen={codePopoverOpen}
        onExternalOpenChange={setCodePopoverOpen}
        anchorRect={popoverAnchorRect}
      />
    </div>
  );
}

import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from "@tiptap/react";
import { TemplateChip } from "./TemplateChip";
import { useExecution } from "../context/tool-execution-context";
import { useEffect, useState, useCallback } from "react";
import { useTemplatePreview } from "../hooks/use-template-preview";

export interface TemplateExtensionOptions {
  stepId: string;
}

export interface TemplateExtensionStorage {
  stepId: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    template: {
      setStepId: (stepId: string) => ReturnType;
    };
  }

  interface Storage {
    template?: TemplateExtensionStorage;
  }
}

function TemplateNodeView(props: NodeViewProps) {
  const { node, deleteNode, updateAttributes, selected, editor } = props;
  const stepId = editor.storage.template?.stepId ?? "";
  const { getStepTemplateData, sourceDataVersion } = useExecution();
  const { sourceData, dataSelectorOutput, canExecute } = getStepTemplateData(stepId);

  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [forcePopoverOpen, setForcePopoverOpen] = useState(false);

  const rawTemplate = node.attrs.rawTemplate as string;
  const expression =
    rawTemplate.startsWith("<<") && rawTemplate.endsWith(">>")
      ? rawTemplate.slice(2, -2).trim()
      : rawTemplate.trim();

  const needsDataSelectorOutput = expression.includes("currentItem");
  const shouldEvaluate = canExecute && (!needsDataSelectorOutput || !!dataSelectorOutput);

  const { previewValue, previewError, hasResult, isEvaluating } = useTemplatePreview(
    expression,
    sourceData,
    { enabled: shouldEvaluate, debounceMs: 100, stepId, sourceDataVersion },
  );

  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;

    const updateFocus = () => setIsEditorFocused(dom.contains(document.activeElement));
    dom.addEventListener("focusin", updateFocus);
    dom.addEventListener("focusout", updateFocus);
    updateFocus();

    return () => {
      dom.removeEventListener("focusin", updateFocus);
      dom.removeEventListener("focusout", updateFocus);
    };
  }, [editor]);

  const isActuallySelected = selected && isEditorFocused;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isActuallySelected && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setForcePopoverOpen(true);
      }
    },
    [isActuallySelected],
  );

  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;
    dom.addEventListener("keydown", handleKeyDown, true);
    return () => dom.removeEventListener("keydown", handleKeyDown, true);
  }, [editor, handleKeyDown]);

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    if (!open) setForcePopoverOpen(false);
  }, []);

  return (
    <NodeViewWrapper as="span" className="inline">
      <TemplateChip
        template={rawTemplate}
        evaluatedValue={previewValue}
        error={previewError ?? undefined}
        hasResult={hasResult}
        isEvaluating={isEvaluating}
        onUpdate={(newTemplate) => updateAttributes({ rawTemplate: newTemplate })}
        onDelete={deleteNode}
        stepId={stepId}
        inline={true}
        selected={isActuallySelected}
        forcePopoverOpen={forcePopoverOpen}
        onPopoverOpenChange={handlePopoverOpenChange}
      />
    </NodeViewWrapper>
  );
}

const TEMPLATE_REGEX = /<<(.+?)>>$/;

export const TemplateExtension = Node.create<TemplateExtensionOptions, TemplateExtensionStorage>({
  name: "template",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      stepId: "",
    };
  },

  addStorage() {
    return {
      stepId: this.options.stepId,
    };
  },

  addCommands() {
    return {
      setStepId:
        (stepId: string) =>
        ({ editor }) => {
          if (editor.storage.template) {
            editor.storage.template.stepId = stepId;
          }
          return true;
        },
    };
  },

  addAttributes() {
    return {
      rawTemplate: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-template"),
        renderHTML: (attributes) => ({ "data-template": attributes.rawTemplate }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-template]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "template-node" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplateNodeView);
  },

  addInputRules() {
    const nodeType = this.type;
    return [
      new InputRule({
        find: TEMPLATE_REGEX,
        handler: ({ state, range, match }) => {
          const templateNode = nodeType.create({ rawTemplate: match[0] });
          state.tr.replaceWith(range.from, range.to, templateNode);
        },
      }),
    ];
  },
});

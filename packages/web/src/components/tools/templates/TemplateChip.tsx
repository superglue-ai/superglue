import { cn } from '@/src/lib/general-utils';
import { truncateTemplateValue, prepareSourceData, extractCredentials } from '@/src/lib/templating-utils';
import { maskCredentials } from '@superglue/shared';
import { Code2, X } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { TemplateEditPopover } from './TemplateEditPopover';
import { useTemplateContext } from './tiptap/TemplateContext';

interface TemplateChipProps {
  template: string;
  evaluatedValue: any;
  error?: string;
  stepData: any;
  loopData?: any;
  hasResult?: boolean;
  canExecute?: boolean;
  onUpdate: (newTemplate: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  inline?: boolean;
  selected?: boolean;
  forcePopoverOpen?: boolean;
  onPopoverOpenChange?: (open: boolean) => void;
  loopMode?: boolean;
  hideDelete?: boolean;
  popoverTitle?: string;
  popoverHelpText?: string;
}

export function TemplateChip({
  template,
  evaluatedValue,
  error,
  stepData,
  loopData,
  hasResult = true,
  canExecute = true,
  onUpdate,
  onDelete,
  readOnly = false,
  inline = false,
  selected = false,
  forcePopoverOpen = false,
  onPopoverOpenChange,
  loopMode = false,
  hideDelete = false,
  popoverTitle,
  popoverHelpText,
}: TemplateChipProps) {
  const { sourceDataVersion } = useTemplateContext();
  const sourceData = useMemo(() => prepareSourceData(stepData, loopData), [stepData, loopData]);
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  
  const effectiveOpen = isPopoverOpen || forcePopoverOpen;

  const templateExpr = template.replace(/^<<|>>$/g, '').trim();

  const hasError = !!error;
  const isUnresolved = !hasError && !canExecute;
  const isResolvedUndefined = !hasError && canExecute && hasResult && evaluatedValue === undefined;
  const isLoading = canExecute && !hasResult && evaluatedValue === undefined;
  
  const isLoopArray = loopMode && Array.isArray(evaluatedValue) && evaluatedValue.length > 0;
  const displayValue = isLoopArray ? evaluatedValue[0] : evaluatedValue;

  const credentials = useMemo(() => extractCredentials(sourceData), [sourceData]);

  let displayText: string;
  let isTruncated = false;
  let originalSize = 0;

  if (hasError) {
    displayText = `Error: ${error.slice(0, 50)}${error.length > 50 ? '...' : ''}`;
  } else if (isUnresolved) {
    displayText = `unresolved: ${templateExpr.slice(0, 30)}${templateExpr.length > 30 ? '...' : ''}`;
  } else if (isLoading) {
    displayText = '';
  } else if (isResolvedUndefined) {
    displayText = 'undefined';
  } else {
    let fullDisplayText: string;
    if (displayValue === null) {
      fullDisplayText = 'null';
    } else if (typeof displayValue === 'string') {
      fullDisplayText = displayValue === '' ? '""' : displayValue;
    } else if (typeof displayValue === 'object') {
      try {
        fullDisplayText = JSON.stringify(displayValue);
      } catch {
        fullDisplayText = '[Complex Object]';
      }
    } else {
      fullDisplayText = String(displayValue);
    }

    originalSize = fullDisplayText.length;
    const masked = maskCredentials(fullDisplayText, credentials);
    const truncated = truncateTemplateValue(masked, 150);
      displayText = truncated.display;
      isTruncated = truncated.truncated;
      originalSize = truncated.originalSize;
  }

  const isActive = selected || effectiveOpen;
  
  const getChipClasses = () => {
    if (hasError) {
      return {
        bg: 'bg-red-500/20 dark:bg-red-500/20',
        border: isActive ? 'border-red-500/50 dark:border-red-400/50' : 'border-transparent',
        text: 'text-red-700 dark:text-red-300'
      };
    }
    
    if (isUnresolved) {
      return {
        bg: 'bg-gray-500/15 dark:bg-gray-400/20',
        border: isActive ? 'border-gray-400/50 dark:border-gray-500/50' : 'border-transparent',
        text: 'text-gray-600 dark:text-gray-300'
      };
    }
    
    return {
      bg: 'bg-green-600/15 dark:bg-green-400/20',
      border: isActive ? 'border-green-600/50 dark:border-green-400/50' : 'border-transparent',
      text: 'text-green-700 dark:text-green-400'
    };
  };

  const chipClasses = getChipClasses();
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!effectiveOpen || !chipRef.current) return;
    
    const chip = chipRef.current;
    const scrollParent = chip.closest('[style*="overflow"]') as HTMLElement | null;
    if (!scrollParent) return;
    
    const handleScroll = () => {
      setIsPopoverOpen(false);
      onPopoverOpenChange?.(false);
    };
    
    scrollParent.addEventListener('scroll', handleScroll);
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [effectiveOpen, onPopoverOpenChange]);

  const chipContent = (
    <span
      ref={chipRef}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono select-none border",
        "transition-all duration-150",
        chipClasses.bg,
        chipClasses.border,
        chipClasses.text,
        !readOnly && "cursor-pointer",
        readOnly && "cursor-default",
        inline && "align-middle"
      )}
      style={{ lineHeight: '1.3' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isTruncated ? `${originalSize} chars (click to view)` : undefined}
    >
      <span className="w-3 h-3 flex items-center justify-center shrink-0">
        {isLoading ? (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : !readOnly && !hideDelete && isHovered ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="hover:opacity-70"
            title="Delete"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <Code2 className="h-3 w-3" />
        )}
      </span>
      <span className="max-w-[200px] truncate">
        {displayText}
      </span>
    </span>
  );

  const handleOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (!open) {
      onPopoverOpenChange?.(false);
    }
  };

  if (readOnly) {
    return chipContent;
  }

  return (
    <TemplateEditPopover
      template={template}
      sourceData={sourceData}
      onSave={onUpdate}
      canExecute={canExecute}
      externalOpen={effectiveOpen}
      onExternalOpenChange={handleOpenChange}
      loopMode={loopMode}
      title={popoverTitle}
      helpText={popoverHelpText}
      sourceDataVersion={sourceDataVersion}
    >
      {chipContent}
    </TemplateEditPopover>
  );
}

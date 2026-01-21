"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TruncatableInstructionProps {
  text: string;
  className?: string;
}

export function TruncatableInstruction({ text, className }: TruncatableInstructionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current) {
      // Check if content is taller than 3 lines (approx 4.5em at text-sm)
      setIsTruncated(textRef.current.scrollHeight > textRef.current.clientHeight + 2);
    }
  }, [text]);

  if (!text) return null;

  return (
    <div className={className}>
      <div ref={textRef} className={isExpanded ? "whitespace-pre-wrap" : "line-clamp-3"}>
        {text}
      </div>
      {(isTruncated || isExpanded) && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

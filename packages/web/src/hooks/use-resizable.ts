import { useState, useCallback } from "react";

interface UseResizableOptions {
  minHeight?: number;
  maxHeight?: number;
  initialHeight?: number;
}

interface UseResizableResult {
  height: string;
  resizeHandleProps: {
    className: string;
    style: React.CSSProperties;
    onMouseDown: (e: React.MouseEvent) => void;
  };
}

export function useResizable({
  minHeight = 100,
  maxHeight = 600,
  initialHeight = 300,
}: UseResizableOptions = {}): UseResizableResult {
  const [height, setHeight] = useState(`${initialHeight}px`);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = parseInt(height);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
        setHeight(`${newHeight}px`);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, minHeight, maxHeight],
  );

  return {
    height,
    resizeHandleProps: {
      className: "absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-10",
      style: { background: "linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)" },
      onMouseDown: handleMouseDown,
    },
  };
}

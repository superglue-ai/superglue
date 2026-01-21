"use client";

import dynamic from "next/dynamic";
import type { default as ScrollToBottomType } from "react-scroll-to-bottom";

export const ScrollToBottomContainer = dynamic(
  () => import("react-scroll-to-bottom").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="flex-1 overflow-hidden relative" />,
  },
) as typeof ScrollToBottomType;

export const ScrollToBottomButton = dynamic(
  () =>
    import("react-scroll-to-bottom").then((mod) => {
      const { useSticky, useScrollToBottom } = mod;
      const { Button } = require("@/src/components/ui/button");
      const { ChevronDown } = require("lucide-react");

      return function ScrollToBottomButtonInner({
        className = "absolute bottom-4 left-1/2 -translate-x-1/2 z-50",
        buttonClassName = "h-10 w-10 p-0 rounded-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 border-2 border-green-400 dark:border-green-500 shadow-xl hover:shadow-2xl transition-all duration-200",
        iconClassName = "w-5 h-5 text-white",
      }: {
        className?: string;
        buttonClassName?: string;
        iconClassName?: string;
      }) {
        const [sticky] = useSticky();
        const scrollToBottom = useScrollToBottom();

        if (sticky) return null;

        return (
          <div className={className}>
            <Button
              onClick={() => scrollToBottom({ behavior: "smooth" })}
              size="sm"
              className={buttonClassName}
              variant="default"
            >
              <ChevronDown className={iconClassName} />
            </Button>
          </div>
        );
      };
    }),
  { ssr: false },
);

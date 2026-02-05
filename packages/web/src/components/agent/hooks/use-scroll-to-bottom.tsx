"use client";

import dynamic from "next/dynamic";
import type { default as ScrollToBottomType } from "react-scroll-to-bottom";
import React from "react";

export interface ScrollToBottomTriggerRef {
  scrollToBottom: () => void;
}

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
        buttonClassName = "h-10 w-10 p-0 rounded-full shadow-xl hover:shadow-2xl transition-all duration-200",
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
              variant="glass-primary"
            >
              <ChevronDown className={iconClassName} />
            </Button>
          </div>
        );
      };
    }),
  { ssr: false },
);

export const ScrollToBottomTrigger = dynamic(
  () =>
    import("react-scroll-to-bottom").then((mod) => {
      const { useScrollToBottom } = mod;
      const { forwardRef, useImperativeHandle } = require("react");

      return forwardRef(function ScrollToBottomTriggerInner(
        _props: object,
        ref: React.Ref<ScrollToBottomTriggerRef>,
      ) {
        const scrollToBottom = useScrollToBottom();

        useImperativeHandle(ref, () => ({
          scrollToBottom: () => scrollToBottom({ behavior: "smooth" }),
        }));

        return null;
      });
    }),
  { ssr: false },
) as React.ForwardRefExoticComponent<React.RefAttributes<ScrollToBottomTriggerRef>>;

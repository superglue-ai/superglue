import { ComponentPropsWithoutRef } from "react";

export const STREAMDOWN_COMPONENTS = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

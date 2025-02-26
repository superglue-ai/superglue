"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  ComponentType,
  ForwardedRef,
  PropsWithoutRef,
  useId,
  createContext,
  useContext,
} from "react";
import { z } from "zod";
import { useAssistantRuntime } from "@assistant-ui/react";
import { useComposedRefs } from "@radix-ui/react-compose-refs";
import { tool } from "@assistant-ui/react";

const click = tool({
  parameters: z.object({
    clickId: z.string(),
  }),
  execute: async ({ clickId }) => {
    const escapedClickId = CSS.escape(clickId);
    const el = document.querySelector(`[data-click-id='${escapedClickId}']`);
    if (el instanceof HTMLElement) {
      el.click();

      // todo make adjustable
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return {};
    } else {
      return "Element not found";
    }
  },
});

const edit = tool({
  parameters: z.object({
    editId: z.string(),
    value: z.string(),
  }),
  execute: async ({ editId, value }) => {
    const escapedEditId = CSS.escape(editId);
    const el = document.querySelector(`[data-edit-id='${escapedEditId}']`);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      // Get React instance from DOM node
      const key = Object.keys(el).find(key => 
        key.startsWith('__reactFiber$') || 
        key.startsWith('__reactInternalInstance$')
      );
      
      if (key) {
        const fiber = el[key];
        const props = fiber.memoizedProps || {};
        
        // Set the value directly
        el.value = value;
        
        // If we can access the onChange prop directly
        if (props.onChange && typeof props.onChange === 'function') {
          // Create a synthetic-like event object
          const syntheticEvent = {
            target: el,
            currentTarget: el,
            preventDefault: () => {},
            stopPropagation: () => {},
            bubbles: true,
            cancelable: true,
            type: 'change'
          };
          
          // Call React's own handler
          props.onChange(syntheticEvent);
        }
      }
      
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      return {};
    } else {
      return "Element not found";
    }
  },
});

const ReadableContext = createContext<boolean>(false);

export const makeAssistantVisible = <T extends ComponentType<any>>(
  Component: T,
  config?: { clickable?: boolean | undefined; editable?: boolean | undefined },
) => {
  const ReadableComponent = forwardRef(
    (props: PropsWithoutRef<T>, outerRef: ForwardedRef<any>) => {
      const isNestedReadable = useContext(ReadableContext);

      const clickId = useId();
      const componentRef = useRef<HTMLElement>(null);

      const assistant = useAssistantRuntime();
      useEffect(() => {
        return assistant.registerModelContextProvider({
          getModelContext: () => {
            return {
              ...(config?.clickable ? { tools: { click } } : {}),
              ...(config?.editable ? { tools: { edit } } : {}),
              system: !isNestedReadable // only pass content if this readable isn't nested in another readable
                ? componentRef.current?.outerHTML
                : undefined,
            };
          },
        });
      }, [config?.clickable, config?.editable, isNestedReadable]);

      const ref = useComposedRefs(componentRef, outerRef);

      return (
        <ReadableContext.Provider value={true}>
          <Component
            {...(props as any)}
            {...(config?.clickable ? { "data-click-id": clickId } : {})}
            {...(config?.editable ? { "data-edit-id": clickId } : {})}
            ref={ref}
          />
        </ReadableContext.Provider>
      );
    },
  );

  return ReadableComponent as unknown as T;
};

export default makeAssistantVisible;

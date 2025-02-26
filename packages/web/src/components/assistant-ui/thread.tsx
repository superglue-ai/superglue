import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type { FC } from "react";
import {
  ArrowDownIcon,
  Bot,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Minimize2,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useState, useEffect } from "react";

import { Button } from "../ui/button";
import { MarkdownText } from "../assistant-ui/markdown-text";
import { TooltipIconButton } from "../assistant-ui/tooltip-icon-button";
import { useAssistantRuntime } from "@assistant-ui/react";

export const Thread: FC = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const runtime = useAssistantRuntime();
  
  const handleNewMessage = () => {
    if (isMinimized) {
      setHasNewMessages(true);
    }
  };

  return (
    <ThreadPrimitive.Root
      className={cn(
        "bg-background box-border transition-all duration-200 relative",
        isMinimized ? "w-10" : "w-96",
        "h-full overflow-hidden"
      )}
      style={{
        ["--thread-max-width" as string]: "48rem",
      }}
    >
      <div className={cn(
        "absolute left-0",
        isMinimized ? "top-1/2 transform -translate-y-1/2" : "top-0"
      )}>
        <TooltipIconButton
          tooltip={isMinimized ? "Expand" : "Minimize"}
          variant="default"
          onClick={() => {
            setIsMinimized(!isMinimized);
            if (!isMinimized) {
              setHasNewMessages(false);
            }
          }}
          className="rounded-lg border-l-0 bg-background w-10 h-10"
        >
          {isMinimized ? <Bot className="w-6 h-6" /> : <Minimize2 className="w-5 h-5" />}
        </TooltipIconButton>
      </div>

      <ThreadPrimitive.Viewport 
        className={cn(
          "flex flex-col items-center overflow-y-auto bg-inherit pt-8 space-y-6",
          isMinimized ? "hidden" : "h-full"
        )}
        style={{ scrollbarGutter: "stable" }}
      >
        <ThreadWelcome />

        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessage,
            EditComposer: EditComposer,
            AssistantMessage: () => <AssistantMessage onNewMessage={handleNewMessage} />,
          }}
        />

        <ThreadPrimitive.If empty={false}>
          <div className="min-h-8 flex-grow" />
        </ThreadPrimitive.If>

        <div className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <p className="mt-4 font-medium">
            Let's transform some data
          </p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="mt-3 flex w-full items-stretch justify-center gap-4">
     <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="What can I do with superglue?"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          What can I do with superglue?
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="Please create a new api configuration. Fetch all product titles and descriptions from the https://timbuk2.com."
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Show me an example
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="focus-within:border-ring/20 focus-within:shadow-lg flex w-full flex-wrap items-end rounded-xl border bg-card/50 backdrop-blur-sm px-3 shadow-sm transition-all duration-200 ease-in">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Write a message..."
        className="placeholder:text-muted-foreground h-40 max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
      />
      <ComposerAction />
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <SendHorizontalIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-3 [&:where(>*)]:col-start-2 w-full max-w-[var(--thread-max-width)]">
      <UserActionBar />

      <div className="bg-muted/50 backdrop-blur-sm text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-6 py-3.5 col-start-2 row-start-2 shadow-sm hover:shadow-md transition-shadow duration-200">
        <MessagePrimitive.Content />
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end col-start-1 row-start-2 mr-3 mt-2.5"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl">
      <ComposerPrimitive.Input className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none" />

      <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">Cancel</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>Send</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC<{ onNewMessage?: () => void }> = ({ onNewMessage }) => {
  useEffect(() => {
    onNewMessage?.();
  }, [onNewMessage]);

  const runtime = useAssistantRuntime();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  
  // Check if the message starts with a warning symbol
  useEffect(() => {
    const messageContent = runtime.thread.getState().messages.at(-1)?.content;
    if (messageContent && messageContent.length > 0) {
      const textContent = messageContent[0].type === 'text' ? messageContent[0].text : '';
      const hasWarning = textContent.startsWith('⚠️');
      setShowSuggestions(hasWarning);
      setIsErrorMessage(hasWarning);
    }
  }, [runtime.thread.getState().messages]);

  return (
    <MessagePrimitive.Root className="grid grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] relative w-full max-w-[var(--thread-max-width)] px-4">
      <div className={cn(
        "text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words col-span-2 col-start-2 row-start-1 my-2 space-y-1",
        isErrorMessage && "border-2 border-red-500 rounded-lg p-2"
      )}>
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>

      <AssistantActionBar isErrorMessage={isErrorMessage} />

      <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
      
      {showSuggestions && (
        <div className="col-span-3 mt-2 flex flex-wrap gap-2 justify-start">
          <ThreadPrimitive.Suggestion
            className="hover:bg-muted/80 flex items-center justify-center rounded-lg border p-2 transition-colors ease-in"
            prompt="How do I fix this?"
            method="replace"
            autoSend
            onClick={() => setShowSuggestions(false)}
          >
            <span className="text-sm">How do I fix this?</span>
          </ThreadPrimitive.Suggestion>
          
          <ThreadPrimitive.Suggestion
            className="hover:bg-muted/80 flex items-center justify-center rounded-lg border p-2 transition-colors ease-in"
            prompt="Can I get more context?"
            method="replace"
            autoSend
            onClick={() => setShowSuggestions(false)}
          >
            <span className="text-sm">Can I get more context?</span>
          </ThreadPrimitive.Suggestion>
        </div>
      )}
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC<{ isErrorMessage?: boolean }> = ({ isErrorMessage }) => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground flex gap-1 col-start-3 row-start-2 -ml-1 data-[floating]:bg-background data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      {/* <MessagePrimitive.If speaking={false}>
        <ActionBarPrimitive.Speak asChild>
          <TooltipIconButton tooltip="Read aloud">
            <AudioLinesIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Speak>
      </MessagePrimitive.If>
      <MessagePrimitive.If speaking>
        <ActionBarPrimitive.StopSpeaking asChild>
          <TooltipIconButton tooltip="Stop">
            <StopCircleIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.StopSpeaking>
      </MessagePrimitive.If> */}
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      {!isErrorMessage && (
        <ActionBarPrimitive.Reload asChild>
          <TooltipIconButton tooltip="Refresh">
            <RefreshCwIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Reload>
      )}
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("text-muted-foreground inline-flex items-center text-xs", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};

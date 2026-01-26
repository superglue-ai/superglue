"use client";

import { Message } from "@superglue/shared";
import { useCallback, useRef } from "react";
import type { AgentConfig, UseAgentStreamingReturn, ToolConfirmationMetadata } from "./types";

interface UseAgentStreamingOptions {
  config: AgentConfig;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  updateMessageWithData: (msg: Message, data: any, targetMessage: Message) => Message;
  updateToolCompletion: (toolCallId: string, data: any) => void;
}

export function useAgentStreaming({
  config,
  setMessages,
  updateMessageWithData,
  updateToolCompletion,
}: UseAgentStreamingOptions): UseAgentStreamingReturn {
  const streamDripBufferRef = useRef("");
  const streamDripTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentStreamControllerRef = useRef<AbortController | null>(null);

  const startDrip = useCallback(
    (assistantMessageId: string) => {
      if (streamDripTimerRef.current) return;
      streamDripTimerRef.current = setInterval(() => {
        if (!streamDripBufferRef.current) return;

        let charsToAdd = 1;
        const bufferLength = streamDripBufferRef.current.length;
        if (bufferLength > 100) charsToAdd = Math.min(20, Math.ceil(bufferLength / 10));
        else if (bufferLength > 50) charsToAdd = 8;
        else if (bufferLength > 20) charsToAdd = 4;
        else if (bufferLength > 10) charsToAdd = 2;

        const toAdd = streamDripBufferRef.current.slice(0, charsToAdd);
        streamDripBufferRef.current = streamDripBufferRef.current.slice(charsToAdd);

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg;
            if (msg.parts && msg.parts.length > 0) {
              const lastPart = msg.parts[msg.parts.length - 1];
              if (lastPart.type === "content") {
                const updatedParts = [...msg.parts];
                updatedParts[updatedParts.length - 1] = {
                  ...lastPart,
                  content: (lastPart.content || "") + toAdd,
                };
                return { ...msg, parts: updatedParts };
              } else {
                return {
                  ...msg,
                  parts: [
                    ...msg.parts,
                    { type: "content", content: toAdd, id: `content-${msg.parts.length}` },
                  ],
                };
              }
            }
            return { ...msg, content: msg.content + toAdd };
          }),
        );
      }, 32);
    },
    [setMessages],
  );

  const stopDrip = useCallback(() => {
    if (streamDripTimerRef.current) {
      clearInterval(streamDripTimerRef.current);
      streamDripTimerRef.current = null;
    }
  }, []);

  const abortStream = useCallback(() => {
    if (currentStreamControllerRef.current) {
      currentStreamControllerRef.current.abort();
      currentStreamControllerRef.current = null;
    }
  }, []);

  const processStreamData = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      currentAssistantMessage: Message | null,
      createMessageIfNeeded: () => Message,
    ) => {
      const decoder = new TextDecoder();
      streamDripBufferRef.current = "";
      stopDrip();

      let assistantMessage = currentAssistantMessage;

      const ensureMessage = (): Message => {
        if (!assistantMessage) {
          assistantMessage = createMessageIfNeeded();
          setMessages((prev) => [...prev, assistantMessage!]);
        }
        return assistantMessage;
      };

      // Buffer for incomplete SSE lines that span multiple chunks
      let lineBuffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush the decoder to get any remaining bytes from incomplete multi-byte characters
            const finalChunk = decoder.decode();
            lineBuffer += finalChunk;

            // Process any remaining buffered data as a final line
            if (lineBuffer.trim() && lineBuffer.startsWith("data: ")) {
              const rawData = lineBuffer.slice(6);
              try {
                const data = JSON.parse(rawData);
                const msg = ensureMessage();
                // Handle the final event same as in the loop
                if (data.type === "tool_call_complete") {
                  updateToolCompletion(data.toolCall.id, data);
                } else if (data.type !== "content") {
                  setMessages((prev) => prev.map((m) => updateMessageWithData(m, data, msg)));
                }
              } catch (parseError) {
                console.error(
                  "[StreamDebug] Failed to parse final buffer:",
                  parseError,
                  "buffer preview:",
                  lineBuffer.substring(0, 200),
                );
              }
            }
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          // Combine with any leftover from previous chunk
          const combined = lineBuffer + chunk;
          const lines = combined.split("\n");

          // The last element might be incomplete (no trailing newline), save it for next iteration
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                const msg = ensureMessage();

                if (data.type === "content") {
                  streamDripBufferRef.current += data.content;
                  startDrip(msg.id);
                  continue;
                }

                while (streamDripBufferRef.current) {
                  await new Promise((resolve) => setTimeout(resolve, 10));
                }

                if (data.type === "tool_call_complete") {
                  updateToolCompletion(data.toolCall.id, data);

                  let parsedOutput: any = null;
                  try {
                    parsedOutput =
                      typeof data.toolCall.output === "string"
                        ? JSON.parse(data.toolCall.output)
                        : data.toolCall.output;
                  } catch (e) {
                    console.warn(
                      "[StreamDebug] Failed to parse tool output:",
                      e,
                      "output preview:",
                      typeof data.toolCall.output === "string"
                        ? data.toolCall.output.substring(0, 300)
                        : data.toolCall.output,
                    );
                  }

                  const confirmation = data.confirmation as ToolConfirmationMetadata | undefined;
                  const alreadyConfirmed = parsedOutput?.confirmationState !== undefined;
                  const hasConfirmableContent =
                    parsedOutput?.diffs?.length > 0 || parsedOutput?.newPayload;

                  const needsPostExecConfirmation =
                    !alreadyConfirmed &&
                    confirmation?.timing === "after" &&
                    parsedOutput?.success === true &&
                    hasConfirmableContent;

                  if (needsPostExecConfirmation) {
                    setMessages((prev) =>
                      prev.map((m) => (m.id === msg.id ? { ...m, isStreaming: false } : m)),
                    );
                    currentStreamControllerRef.current?.abort();
                    return;
                  }
                } else {
                  setMessages((prev) => prev.map((m) => updateMessageWithData(m, data, msg)));
                }
              } catch (parseError) {
                console.error(
                  "[StreamDebug] Failed to parse SSE line:",
                  parseError,
                  "line length:",
                  line.length,
                  "line preview:",
                  line.substring(0, 300),
                );
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Stream was aborted");
        } else {
          throw error;
        }
      } finally {
        if (assistantMessage && streamDripBufferRef.current) {
          const finalMsgId = assistantMessage.id;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== finalMsgId) return msg;
              if (msg.parts && msg.parts.length > 0) {
                const lastPart = msg.parts[msg.parts.length - 1];
                if (lastPart.type === "content") {
                  const updatedParts = [...msg.parts];
                  updatedParts[updatedParts.length - 1] = {
                    ...lastPart,
                    content: (lastPart.content || "") + streamDripBufferRef.current,
                  };
                  return { ...msg, parts: updatedParts };
                } else {
                  return {
                    ...msg,
                    parts: [
                      ...msg.parts,
                      {
                        type: "content",
                        content: streamDripBufferRef.current,
                        id: `content-${msg.parts.length}`,
                      },
                    ],
                  };
                }
              }
              return { ...msg, content: msg.content + streamDripBufferRef.current };
            }),
          );
          streamDripBufferRef.current = "";
        }
        stopDrip();
      }
    },
    [setMessages, startDrip, stopDrip, updateMessageWithData, updateToolCompletion],
  );

  return {
    processStreamData,
    currentStreamControllerRef,
    abortStream,
    startDrip,
    stopDrip,
    streamDripBufferRef,
  };
}

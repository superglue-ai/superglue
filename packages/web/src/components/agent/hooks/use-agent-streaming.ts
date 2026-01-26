"use client";

import { injectPlaygroundContext } from "@/src/lib/agent/agent-context";
import { requiresConfirmationAfterExec } from "@/src/lib/agent/agent-helpers";
import { truncateFileContent } from "@/src/lib/file-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Message } from "@superglue/shared";
import { useCallback, useRef } from "react";
import type { AgentConfig, UploadedFile, UseAgentStreamingReturn } from "./types";

interface UseAgentStreamingOptions {
  config: AgentConfig;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  updateMessageWithData: (msg: Message, data: any, targetMessage: Message) => Message;
  updateToolCompletion: (toolCallId: string, data: any) => void;
  uploadedFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  pendingSystemMessagesRef: React.MutableRefObject<string[]>;
}

export function useAgentStreaming({
  config,
  setMessages,
  updateMessageWithData,
  updateToolCompletion,
  uploadedFiles,
  filePayloads,
  pendingSystemMessagesRef,
}: UseAgentStreamingOptions): UseAgentStreamingReturn {
  const streamDripBufferRef = useRef("");
  const streamDripTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentStreamControllerRef = useRef<AbortController | null>(null);

  const chatEndpoint = config.chatEndpoint || "/api/agent/chat";
  const getAuthToken = config.getAuthToken || (() => tokenRegistry.getToken());

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
    async (reader: ReadableStreamDefaultReader<Uint8Array>, currentAssistantMessage: Message) => {
      const decoder = new TextDecoder();
      streamDripBufferRef.current = "";
      stopDrip();

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
                // Handle the final event same as in the loop
                if (data.type === "tool_call_complete") {
                  updateToolCompletion(data.toolCall.id, data);
                } else if (data.type !== "content") {
                  setMessages((prev) =>
                    prev.map((msg) => updateMessageWithData(msg, data, currentAssistantMessage)),
                  );
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

                if (data.type === "content") {
                  streamDripBufferRef.current += data.content;
                  startDrip(currentAssistantMessage.id);
                  continue;
                }

                while (streamDripBufferRef.current) {
                  await new Promise((resolve) => setTimeout(resolve, 10));
                }

                if (data.type === "tool_call_complete") {
                  updateToolCompletion(data.toolCall.id, data);

                  const toolName = data.toolCall.name;
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

                  const alreadyConfirmed = parsedOutput?.confirmationState !== undefined;
                  const hasConfirmableContent =
                    parsedOutput?.diffs?.length > 0 || parsedOutput?.newPayload;

                  const needsPostExecConfirmation =
                    !alreadyConfirmed &&
                    requiresConfirmationAfterExec(toolName) &&
                    parsedOutput?.success === true &&
                    hasConfirmableContent;

                  const isPendingUserConfirmation =
                    parsedOutput?.confirmationState === "PENDING_USER_CONFIRMATION";

                  if (needsPostExecConfirmation || isPendingUserConfirmation) {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === currentAssistantMessage.id
                          ? { ...msg, isStreaming: false }
                          : msg,
                      ),
                    );
                    currentStreamControllerRef.current?.abort();
                    return;
                  }
                } else {
                  setMessages((prev) =>
                    prev.map((msg) => updateMessageWithData(msg, data, currentAssistantMessage)),
                  );
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
        if (streamDripBufferRef.current) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== currentAssistantMessage.id) return msg;
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

  const sendChatMessage = useCallback(
    async (messages: Message[], assistantMessage: Message, signal?: AbortSignal) => {
      let messagesToSend = [...messages];

      if (config.playgroundContext) {
        messagesToSend = injectPlaygroundContext(messagesToSend, config.playgroundContext);
      }

      if (config.onBeforeMessage) {
        messagesToSend = config.onBeforeMessage(messagesToSend);
      }

      const systemMessages: string[] = [];

      if (uploadedFiles.length > 0) {
        const readyFiles = uploadedFiles.filter((f) => f.status === "ready");
        if (readyFiles.length > 0) {
          const MAX_CHARS_PER_FILE = 50000;
          const charBudgetPerFile = Math.floor(MAX_CHARS_PER_FILE / Math.max(1, readyFiles.length));

          let referencesList =
            "[SYSTEM] Files uploaded in THIS message (use EXACTLY these keys):\n";
          for (const file of readyFiles) {
            referencesList += `- ${file.name} => file::${file.key}\n`;
          }
          referencesList +=
            "\nYou can reference these files via the file::key pattern. Files from previous messages are not accessible.";
          systemMessages.push(referencesList);

          for (const file of readyFiles) {
            const content = filePayloads[file.key];
            if (content) {
              const contentStr =
                typeof content === "string" ? content : JSON.stringify(content, null, 2);
              const { truncated, wasTruncated } = truncateFileContent(
                contentStr,
                charBudgetPerFile,
              );

              let fileMessage = `[SYSTEM] File content for file::${file.key} (original: "${file.name}"):\n\n`;
              fileMessage += `<file key="${file.key}">\n${truncated}\n</file>`;

              if (wasTruncated) {
                fileMessage += `\n\n[Note: File content was truncated. Original size: ${contentStr.length.toLocaleString()} chars. Full content available when you reference file::${file.key}]`;
              }
              systemMessages.push(fileMessage);
            }
          }
        }
      }

      if (pendingSystemMessagesRef.current.length > 0) {
        systemMessages.push(...pendingSystemMessagesRef.current);
        pendingSystemMessagesRef.current = [];
      }

      if (systemMessages.length > 0) {
        const systemContent = systemMessages.join("\n\n");
        let lastUserMessageIndex = -1;
        for (let i = messagesToSend.length - 1; i >= 0; i--) {
          if (messagesToSend[i].role === "user") {
            lastUserMessageIndex = i;
            break;
          }
        }

        if (lastUserMessageIndex !== -1) {
          const originalMessage = messagesToSend[lastUserMessageIndex];
          messagesToSend = [
            ...messagesToSend.slice(0, lastUserMessageIndex),
            { ...originalMessage, content: `${systemContent}\n\n${originalMessage.content}` },
            ...messagesToSend.slice(lastUserMessageIndex + 1),
          ];
        }
      }

      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          messages: messagesToSend,
          filePayloads,
          toolSet: config.toolSet || "agent",
        }),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentication failed. Please check your API key configuration.");
        }
        const error = await response.json();
        throw new Error(
          `HTTP error ${response.status}: ${error?.error || "Internal server error"}`,
        );
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      await processStreamData(reader, assistantMessage);
    },
    [
      chatEndpoint,
      getAuthToken,
      uploadedFiles,
      filePayloads,
      pendingSystemMessagesRef,
      processStreamData,
      config,
    ],
  );

  return {
    sendChatMessage,
    processStreamData,
    currentStreamControllerRef,
    abortStream,
    startDrip,
    stopDrip,
    streamDripBufferRef,
  };
}

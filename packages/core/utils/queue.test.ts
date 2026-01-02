import { describe, expect, it } from "vitest";
import { Queue } from "./queue.js";

describe("Queue", () => {
  it("should process jobs in order", async () => {
    const queue = new Queue("test", { orgId: "" });
    const results: number[] = [];

    const task1 = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(1);
    };
    const task2 = async () => {
      results.push(2);
    };

    queue.enqueue("1", task1);
    queue.enqueue("2", task2);

    // Wait for queue to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(results).toEqual([1, 2]);
  });

  it("should not add duplicate jobs", () => {
    const queue = new Queue("test", { orgId: "" });
    const task = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100000));
    };

    queue.enqueue("1", task);
    queue.enqueue("1", task);

    // @ts-ignore - accessing private property for testing
    expect(queue.queue.length).toBe(0);
  });

  it("should handle job errors without stopping the queue", async () => {
    const queue = new Queue("test", { orgId: "" });
    const results: string[] = [];

    const failingTask = async () => {
      throw new Error("Task failed");
    };
    const successTask = async () => {
      results.push("success");
    };

    queue.enqueue("1", failingTask);
    queue.enqueue("2", successTask);

    // Wait for queue to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(results).toEqual(["success"]);
  });
});

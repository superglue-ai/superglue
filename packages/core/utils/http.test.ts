import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAxios } from "./http.js";

vi.mock("axios");
vi.mock("./logs.js", () => ({ logMessage: vi.fn() }));

describe("callAxios", () => {
  const mockAxios = vi.mocked(axios);
  const NOW = new Date("2024-01-01T00:00:00.000Z");

  const rateLimitedResponse = (retryAfter: string) =>
    ({
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": retryAfter },
      data: Buffer.from(""),
      config: {},
    }) as any;

  const okResponse = () =>
    ({
      status: 200,
      statusText: "OK",
      headers: {},
      data: Buffer.from("{}"),
      config: {},
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("429 handling", () => {
    it.each([
      ["an HTTP-date in the past", "Wed, 21 Oct 2015 07:28:00 GMT"],
      ["an unparseable value", "soon"],
      ["zero seconds", "0"],
    ])(
      "should back off and stop retrying within the rate-limit wait budget when Retry-After is %s",
      async (_label, retryAfter) => {
        // A server that keeps answering 429. If the loop respects the wait budget it gives
        // up long before this many calls; without a delay it just spins through them.
        const RUNAWAY_CALLS = 50;
        mockAxios.mockImplementation(async () =>
          mockAxios.mock.calls.length <= RUNAWAY_CALLS
            ? rateLimitedResponse(retryAfter)
            : okResponse(),
        );

        const settled = callAxios(
          { method: "GET", url: "https://api.example.com/resource" },
          { retries: 0 },
        ).then(
          (result) => ({ result }),
          (error) => ({ error }),
        );
        await vi.runAllTimersAsync();
        const outcome = await settled;

        expect("error" in outcome ? outcome.error : undefined).toBeUndefined();
        const { result } = outcome as { result: Awaited<ReturnType<typeof callAxios>> };
        expect(result.response.status).toBe(429);
        expect(mockAxios.mock.calls.length).toBeLessThan(RUNAWAY_CALLS);
        // Retries must actually be spaced out, not fired back to back.
        expect(Date.now() - NOW.getTime()).toBeGreaterThanOrEqual(1000);
      },
    );

    it("should wait the number of seconds given by a numeric Retry-After header", async () => {
      mockAxios.mockResolvedValueOnce(rateLimitedResponse("5")).mockResolvedValueOnce(okResponse());

      const settled = callAxios(
        { method: "GET", url: "https://api.example.com/resource" },
        { retries: 0 },
      );
      await vi.advanceTimersByTimeAsync(4999);
      expect(mockAxios).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await settled;

      expect(result.response.status).toBe(200);
      expect(mockAxios).toHaveBeenCalledTimes(2);
    });
  });
});

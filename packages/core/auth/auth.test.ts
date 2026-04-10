import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetAuthManager, validateToken } from "./auth.js";

vi.mock("../utils/logs.js");

describe("Auth Module", () => {
  describe("validateToken", () => {
    let mockAuthManager: any;

    beforeEach(() => {
      _resetAuthManager();
      // Create mock instance with authenticate method
      mockAuthManager = {
        authenticate: vi.fn(),
      };

      // Reset the mock function calls before each test
      mockAuthManager.authenticate.mockReset();

      // Directly set the internal auth manager to our mock instance
      _resetAuthManager(mockAuthManager);
    });

    it("returns failure when no token provided", async () => {
      // Reset manager to null for this specific test case where getAuthManager shouldn't be called with a token
      _resetAuthManager(null);
      const result = await validateToken(undefined);
      expect(result).toEqual({
        success: false,
        message: "No token provided",
        orgId: "",
      });
    });

    it("validates token through auth manager", async () => {
      const mockAuthResult = { success: true, orgId: "org123" };
      mockAuthManager.authenticate.mockResolvedValue(mockAuthResult);

      const result = await validateToken("test123");
      expect(mockAuthManager.authenticate).toHaveBeenCalledWith("test123");
      expect(result).toEqual({
        success: true,
        message: "Authentication successful",
        orgId: "org123",
      });
    });
  });
});

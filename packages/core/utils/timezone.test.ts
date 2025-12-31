import { describe, test, expect } from "vitest";
import { isValidTimezone } from "./timezone.js";

describe("isValidTimezone", () => {
  test("should return true for valid IANA timezone names", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("Australia/Sydney")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
  });

  test("should return false for invalid timezone names", () => {
    expect(isValidTimezone("Invalid/Timezone")).toBe(false);
    expect(isValidTimezone("Foo/Bar")).toBe(false);
    expect(isValidTimezone("NotReal")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("America/NonExistent")).toBe(false);
    expect(isValidTimezone("Random String")).toBe(false);
  });

  test("should handle edge cases", () => {
    expect(isValidTimezone("GMT")).toBe(true);
    expect(isValidTimezone("Europe/Dublin")).toBe(true);
    expect(isValidTimezone("Pacific/Honolulu")).toBe(true);
  });
});

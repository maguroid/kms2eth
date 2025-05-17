import { describe, it, expect } from "bun:test";
import { toChecksum } from "../src/checksum";

describe("toChecksum", () => {
  it("formats hex string with EIP-55 checksum", () => {
    const input = "1234567890abcdef1234567890abcdef12345678";
    const expected = "1234567890AbcdEF1234567890aBcdef12345678";
    expect(toChecksum(input)).toBe(expected);
  });
});

import { describe, it, expect } from "bun:test";
import { keccak256 } from "../src/checksum";

describe("keccak256", () => {
  const cases: Array<[string, string]> = [
    ["", "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
    ["bun", "bf957509a93fd37575215ff3ee6ea85b1fb44579ae0d1ff072c55ba2f80724fc"],
    ["hello", "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8"],
  ];

  for (const [input, expected] of cases) {
    it(`hashes "${input}"`, () => {
      expect(Buffer.from(keccak256(input)).toString("hex")).toBe(expected);
    });
  }
});

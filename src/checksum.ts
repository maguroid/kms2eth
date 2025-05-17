export function keccak256(input: string | Uint8Array): Uint8Array {
  const RC = [
    0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
    0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
    0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
    0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
    0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
    0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n
  ];
  const R = [
    [0,36,3,41,18],
    [1,44,10,45,2],
    [62,6,43,15,61],
    [28,55,25,21,56],
    [27,20,39,8,14]
  ];
  const s = new Array<bigint>(25).fill(0n);
  const b = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const BLOCK = 136;
  for (let i = 0; i < b.length; i++) {
    s[i >> 3] ^= BigInt(b[i]) << BigInt((i % 8) * 8);
  }
  s[b.length >> 3] ^= 0x01n << BigInt((b.length % 8) * 8);
  s[(BLOCK - 1) >> 3] ^= 0x80n << BigInt(((BLOCK - 1) % 8) * 8);
  const rot = (x: bigint, n: number) =>
    ((x << BigInt(n)) | (x >> BigInt(64 - n))) & 0xffffffffffffffffn;
  for (let r = 0; r < 24; r++) {
    const C = new Array<bigint>(5).fill(0n);
    for (let x = 0; x < 5; x++) {
      C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    }
    const D = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rot(C[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] ^= D[x];
      }
    }
    const B = new Array<bigint>(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rot(s[x + 5 * y], R[x][y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] =
          B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & B[((x + 2) % 5) + 5 * y]);
      }
    }
    s[0] ^= RC[r];
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number((s[i >> 3] >> BigInt((i % 8) * 8)) & 0xffn);
  }
  return out;
}

export function toChecksum(hex: string): string {
  const h = Buffer.from(keccak256(hex)).toString("hex");
  return [...hex]
    .map((c, i) => (parseInt(h[i], 16) > 7 ? c.toUpperCase() : c))
    .join("");
}

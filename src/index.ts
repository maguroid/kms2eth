#!/usr/bin/env bun
/**
 * kms2eth  —  KMS secp256k1 → Ethereum address
 *   ✅ Switch credentials with --profile / AWS_PROFILE
 *   ✅ Cache public key hash at ~/.cache/kms-addr/cache.json
 */
import { Command } from "commander";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import {
  KMSClient,
  GetPublicKeyCommand,
  NotFoundException,
  DisabledException,
  KMSServiceException,
} from "@aws-sdk/client-kms";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { keccak256, toChecksum } from "./checksum";

/* ------------ CLI & ENV ------------ */
const cli = new Command()
  .requiredOption("-k, --key-id <id>", "KMS KeyId or alias")
  .option(
    "-r, --region <awsRegion>",
    "AWS region",
    process.env.AWS_REGION ?? "us-east-1"
  )
  .option(
    "-p, --profile <awsProfile>",
    "AWS profile name (falls back to AWS_PROFILE env)"
  )
  .option("--no-checksum", "disable EIP-55 checksum")
  .parse();

const opt = cli.opts<{
  keyId: string;
  region: string;
  profile?: string;
  checksum: boolean;
}>();

const credentials = defaultProvider({ profile: opt.profile });

/* ------------ Cache helpers ------------ */
/**
 * Returns the path to the cache file.
 */
function cachePath() {
  const home = process.env.HOME || process.env.USERPROFILE!;
  const base = process.env.XDG_CACHE_HOME ?? `${home}/.cache`;
  return `${base}/kms2eth/cache.json`;
}

type Cache = Record<
  string /* accountId:region:keyId */,
  string /* 40-byte hex */
>;

/**
 * Loads the cache from disk, or returns an empty object if not found.
 */
function loadCache(): Cache {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf8")) as Cache;
  } catch {
    return {};
  }
}

/**
 * Saves the cache object to disk.
 */
function saveCache(cache: Cache) {
  const path = cachePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

/* ------------ Main logic ------------ */
const accountId = await (async () => {
  const sts = new STSClient({ region: opt.region, credentials });
  const command = new GetCallerIdentityCommand({});
  const result = await sts.send(command);
  return result.Account!;
})();
const cacheKey = `${accountId}:${opt.region}:${opt.keyId}`;
const cache = loadCache();

let addrHex = cache[cacheKey];
if (!addrHex) {
  const kms = new KMSClient({ region: opt.region, credentials });

  // Fetch the public key from AWS KMS
  let PublicKey: Uint8Array | undefined;
  try {
    ({ PublicKey } = await kms.send(
      new GetPublicKeyCommand({ KeyId: opt.keyId })
    ));
  } catch (error) {
    handleKmsError(error, accountId, opt.keyId, opt.region);
  }
  if (!PublicKey) {
    console.error("❌  could not fetch public key");
    process.exit(1);
  }

  // Convert DER to 65-byte uncompressed public key (last 65 bytes)
  const uncompressed = new Uint8Array(PublicKey).slice(-65);
  // Drop the 0x04 prefix to get X and Y coordinates
  const pubXY = uncompressed.slice(1);
  // Hash the public key using Keccak-256
  const hash = keccak256(pubXY);
  // Take the last 20 bytes as the Ethereum address
  addrHex = Array.from(hash.slice(-20))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Save the result to cache
  cache[cacheKey] = addrHex;
  saveCache(cache);
}

/**
 * Handles KMS errors.
 */
function handleKmsError(
  error: unknown,
  accountId: string,
  keyId: string,
  region: string
) {
  if (!(error instanceof Error)) {
    console.error("❌  could not fetch public key");
    process.exit(1);
  }
  if (error instanceof NotFoundException) {
    console.error(`❌  could not find key: ${accountId}:${keyId} (${region})`);
    process.exit(2);
  }
  if (error instanceof DisabledException) {
    console.error(`❌  key is disabled: ${accountId}:${keyId} (${region})`);
    process.exit(3);
  }
  if (error instanceof KMSServiceException) {
    console.error(`❌  KMS service error: ${error.name}: ${error.message}`);
    process.exit(4);
  }
  console.error(`❌  unknown error: ${error}`);
  process.exit(5);
}

const outHex = opt.checksum ? toChecksum(addrHex) : addrHex.toLowerCase();
console.log(`0x${outHex}`);

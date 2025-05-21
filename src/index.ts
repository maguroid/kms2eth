#!/usr/bin/env bun
/**
 * kms2eth  —  KMS secp256k1 → Ethereum address
 *   ✅ Switch credentials with --profile / AWS_PROFILE
 *   ✅ Cache public key hash at ~/.cache/kms-addr/cache.json
 */
import { Command } from 'commander';
// mkdirSync, readFileSync, writeFileSync are no longer directly used here
// import { dirname } from 'node:path'; // dirname is no longer used
import process from 'node:process';
import {
  loadCache,
  saveCache,
  // Cache type can be imported if needed, or keep it internal to cache.ts
  // type Cache,
} from './cache';
// KMSException classes are no longer directly imported, error.name is used.
import {
  KMSClient,
  GetPublicKeyCommand,
  // NotFoundException, // Removed
  // DisabledException, // Removed
  // KMSServiceException, // Removed
} from '@aws-sdk/client-kms';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  defaultProvider,
  AwsCredentialIdentityProvider,
} from '@aws-sdk/credential-provider-node'; // Added AwsCredentialIdentityProvider
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils'; // Import for keccak

/* ------------ CLI & ENV ------------ */
let opt: {
  keyId: string;
  region: string;
  profile?: string;
  checksum: boolean;
};
let credentials: AwsCredentialIdentityProvider; // Typed credentials

/**
 * Parses CLI options, sets up credentials, and calls the main logic.
 * This function is intended to be the main entry point when the script is run directly.
 */
async function run() {
  const cli = new Command()
    .requiredOption('-k, --key-id <id>', 'KMS KeyId or alias')
    .option(
      '-r, --region <awsRegion>',
      'AWS region',
      process.env.AWS_REGION ?? 'us-east-1'
    )
    .option(
      '-p, --profile <awsProfile>',
      'AWS profile name (falls back to AWS_PROFILE env)'
    )
    .option('--no-checksum', 'disable EIP-55 checksum')
    .parse();

  opt = cli.opts<{
    keyId: string;
    region: string;
    profile?: string;
    checksum: boolean;
  }>();

  credentials = defaultProvider({ profile: opt.profile });

  // Call the main application logic
  await main();
}

/* ------------ Main Script Logic ------------ */
// opt and credentials will be undefined here if not run via run()
// This is acceptable for tests as they will mock/provide necessary inputs to exported functions.

/**
 * Main function to orchestrate the fetching of AWS account ID,
 * checking the cache for an existing Ethereum address, or fetching
 * it from KMS if not cached, and finally printing the address.
 * It handles EIP-55 checksumming based on CLI options.
 * @async
 */
async function main() {
  try {
    let accountId: string;
    try {
      const sts = new STSClient({ region: opt.region, credentials });
      const command = new GetCallerIdentityCommand({});
      const result = await sts.send(command);
      if (!result.Account) {
        console.error(
          '❌ Critical: Could not determine AWS Account ID. STS response did not include an Account.'
        );
        process.exit(1);
        return;
      }
      accountId = result.Account;
    } catch (error: unknown) {
      // Changed to unknown
      console.error(
        '❌ Error fetching AWS Account ID:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
      return;
    }

    const cacheKey = `${accountId}:${opt.region}:${opt.keyId}`;
    const cache = loadCache();

    let addrHex = cache[cacheKey];
    if (!addrHex) {
      console.log('ℹ️ Cache miss for key, fetching from KMS...');
      const kmsClient = new KMSClient({ region: opt.region, credentials });
      addrHex = await getEthereumAddressFromKms(
        kmsClient,
        opt.keyId,
        accountId,
        opt.region
      );

      cache[cacheKey] = addrHex;
      saveCache(cache);
      console.log('✅ Address successfully fetched from KMS and cached.');
    } else {
      console.log('✅ Address loaded from cache for key.');
    }

    const outHex = opt.checksum ? toChecksum(addrHex) : addrHex.toLowerCase();
    console.log(`0x${outHex}`);
  } catch (error: unknown) {
    // Changed to unknown
    if (typeof process.exitCode !== 'number') {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ An unexpected error occurred in main execution: ${errorMessage}`
      );
      process.exitCode = 10;
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `❌ An unexpected error occurred, exiting (code ${process.exitCode}): ${errorMessage}`
      );
    }
  }
}

/**
 * Fetches the public key from AWS KMS, converts it to an Ethereum address.
 * @param {KMSClient} kmsClient - The KMS client instance.
 * @param {string} keyId - The KMS Key ID or alias.
 * @param {string} currentAccountId - The current AWS account ID (for error handling).
 * @param {string} currentRegion - The current AWS region (for error handling).
 * @returns {Promise<string>} The Ethereum address as a 40-byte hex string.
 */
export async function getEthereumAddressFromKms( // Added export
  kmsClient: KMSClient,
  keyId: string,
  currentAccountId: string,
  currentRegion: string
): Promise<string> {
  let publicKeyDer: Uint8Array | undefined;
  try {
    ({ PublicKey: publicKeyDer } = await kmsClient.send(
      new GetPublicKeyCommand({ KeyId: keyId })
    ));
  } catch (error) {
    handleKmsError(error, currentAccountId, keyId, currentRegion);
  }

  if (!publicKeyDer) {
    // This case should ideally be prevented by handleKmsError exiting,
    // but as a safeguard:
    console.error(
      '❌ Critical: Could not fetch public key, and no error was handled by handleKmsError.'
    );
    process.exit(1);
  }

  // Convert DER to 65-byte uncompressed public key (last 65 bytes)
  const uncompressedPk = new Uint8Array(publicKeyDer).slice(-65);
  // Drop the 0x04 prefix to get X and Y coordinates
  const pubKeyXY = uncompressedPk.slice(1);
  // Hash the public key using Keccak-256
  const addressHash = keccak_256(pubKeyXY);
  // Take the last 20 bytes as the Ethereum address
  const ethAddressHex = Array.from(addressHash.slice(-20))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return ethAddressHex;
}

/**
 * Handles KMS errors by logging a specific message and exiting.
 * This function is marked with `never` as its return type because it always exits the process.
 * @param {unknown} error - The error object caught.
 * @param {string} accountId - The AWS account ID.
 * @param {string} keyId - The KMS Key ID.
 * @param {string} region - The AWS region.
 * @returns {never}
 */
export function handleKmsError( // Added export
  error: unknown,
  accountId: string,
  keyId: string,
  region: string
): never {
  if (!(error instanceof Error)) {
    // Fallback for non-Error types, though KMS SDK typically throws Error instances.
    console.error(
      '❌  An unexpected error occurred while fetching the public key.'
    );
    process.exit(1);
    return; // Explicit return for test environments
  }
  // Using error.name for matching specific AWS SDK errors due to potential instanceof issues with mocks
  if (error.name === 'NotFoundException') {
    console.error(
      `❌  Could not find KMS key: ${keyId} in account ${accountId} (region ${region}).`
    );
    process.exit(2);
    return; // Explicit return
  }
  if (error.name === 'DisabledException') {
    console.error(
      `❌  KMS key is disabled: ${keyId} in account ${accountId} (region ${region}).`
    );
    process.exit(3);
    return; // Explicit return
  }
  if (error.name === 'KMSServiceException') {
    // This is a broader catch-all for other KMS specific errors.
    console.error(
      `❌  KMS service error: ${(error as Error).name} - ${(error as Error).message} (Key: ${keyId}, Account: ${accountId}, Region: ${region}).`
    );
    process.exit(4);
    return; // Explicit return
  }
  // For errors not specifically handled above.
  console.error(
    `❌  An unknown error occurred: ${error.name} - ${error.message} (Key: ${keyId}, Account: ${accountId}, Region: ${region}).`
  );
  process.exit(5);
  // No return needed here as it's the last statement
}

/* ------------ Checksum & output ------------ */
/**
 * Applies EIP-55 checksum to an Ethereum address hex string.
 * The input hex string should not have a "0x" prefix.
 * @param {string} hex - The raw Ethereum address (40 hex characters).
 * @returns {string} The EIP-55 checksummed Ethereum address.
 */
export function toChecksum(hex: string): string {
  const lowerHex = hex.toLowerCase(); // Ensure the input hex is lowercase for hashing and mapping
  const h = keccak_256(utf8ToBytes(lowerHex)).reduce(
    // Reverted to utf8ToBytes as per noble/hashes recommendation
    (s, b) => s + b.toString(16).padStart(2, '0'),
    ''
  );
  const addressChars = lowerHex.split('');

  return addressChars
    .map((c, i) => {
      if (/[a-f]/.test(c)) {
        // Only apply casing to letters
        return parseInt(h[i], 16) > 7 ? c.toUpperCase() : c; // c is already lowercase here
      }
      return c; // Return digits as is
    })
    .join('');
}

// Only run the CLI parsing and main logic if this script is the entry point
if (import.meta.main) {
  run().catch((error) => {
    // console.error is already handled in main or specific error handlers if they exit.
    // This catch is for truly unhandled promise rejections from run() itself.
    if (
      !(
        error instanceof Error &&
        process.exitCode !== undefined &&
        process.exitCode !== 0
      )
    ) {
      // Avoid double printing if process.exit was already called by a known error handler
      console.error(
        '🆘 Unhandled error in script execution:',
        error instanceof Error ? error.message : String(error)
      );
    }
    // Ensure exit with error code if not already set by a more specific handler
    if (process.exitCode === undefined || process.exitCode === 0) {
      process.exit(1);
    }
  });
}

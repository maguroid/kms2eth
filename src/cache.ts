import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

/**
 * Represents the structure of the cache.
 * The key is a composite string: accountId:region:keyId
 * The value is the 40-byte hex Ethereum address.
 */
export type Cache = Record<
  string /* accountId:region:keyId */,
  string /* 40-byte hex */
>;

/**
 * Returns the path to the cache file.
 * It uses XDG_CACHE_HOME if available, otherwise defaults to ~/.cache.
 * @returns {string} The full path to the cache file.
 */
export function cachePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE!;
  if (!home) {
    throw new Error(
      'Could not determine home directory for cache path. Please set HOME or USERPROFILE environment variable.'
    );
  }
  const base = process.env.XDG_CACHE_HOME ?? `${home}/.cache`;
  return `${base}/kms2eth/cache.json`;
}

/**
 * Loads the cache from disk.
 * If the cache file doesn't exist or there's an error reading it,
 * an empty object is returned.
 * @returns {Cache} The loaded cache object or an empty object.
 */
export function loadCache(): Cache {
  const path = cachePath(); // Get path once
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Cache;
  } catch (error: unknown) {
    // Changed to unknown
    const err = error as { code?: string; message?: string }; // Type assertion
    if (err.code !== 'ENOENT') {
      console.warn(
        `Warning: Could not read cache file at ${path}: ${err.message || 'Unknown error'}`
      );
    }
    return {};
  }
}

/**
 * Saves the provided cache object to disk.
 * It creates the directory structure if it doesn't exist.
 * If an error occurs, it logs a warning and allows the program to continue.
 * @param {Cache} cache - The cache object to save.
 */
export function saveCache(cache: Cache): void {
  const path = cachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
  } catch (error: unknown) {
    // Changed to unknown
    const err = error as { message?: string }; // Type assertion
    console.warn(
      `Warning: Could not save cache file at ${path}: ${err.message || 'Unknown error'}`
    );
  }
}

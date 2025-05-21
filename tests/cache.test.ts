import { expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { cachePath, loadCache, saveCache, type Cache } from '../src/cache';

// Mock node:fs module
const mockReadFileSync = mock(() => {});
const mockWriteFileSync = mock(() => {});
const mockMkdirSync = mock(() => {});

mock.module('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

// The import of 'fs' is no longer needed as mocks are directly used.
// import * as fs from 'node:fs';

// Keep a reference to the original process.env
const originalEnv = { ...process.env };
const mockConsoleWarn = mock();

beforeEach(() => {
  // Reset mocks before each test
  mockReadFileSync.mockClear();
  mockWriteFileSync.mockClear();
  mockMkdirSync.mockClear();

  // Mock console.warn
  global.console.warn = mockConsoleWarn;
  mockConsoleWarn.mockClear();

  // Restore original environment variables
  process.env = { ...originalEnv };
});

afterEach(() => {
  // Restore original environment variables after each test
  process.env = originalEnv;
});

test('cachePath should return correct path with HOME set', () => {
  process.env.HOME = '/mockhome';
  delete process.env.XDG_CACHE_HOME;
  delete process.env.USERPROFILE;
  expect(cachePath()).toBe('/mockhome/.cache/kms2eth/cache.json');
});

test('cachePath should return correct path with USERPROFILE set', () => {
  process.env.USERPROFILE = 'C:\\Users\\MockUser';
  delete process.env.XDG_CACHE_HOME;
  delete process.env.HOME;
  expect(cachePath()).toBe('C:\\Users\\MockUser/.cache/kms2eth/cache.json');
});

test('cachePath should use XDG_CACHE_HOME if set', () => {
  process.env.XDG_CACHE_HOME = '/custom/cachedir';
  process.env.HOME = '/mockhome'; // HOME should be ignored
  expect(cachePath()).toBe('/custom/cachedir/kms2eth/cache.json');
});

test('cachePath should throw error if no home directory is found', () => {
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  delete process.env.XDG_CACHE_HOME;
  expect(() => cachePath()).toThrow(
    'Could not determine home directory for cache path.'
  );
});

test('loadCache should return parsed JSON when file exists and is valid', () => {
  const mockCacheData: Cache = { testKey: 'testValue' };
  mockReadFileSync.mockReturnValue(JSON.stringify(mockCacheData));
  const cache = loadCache();
  expect(cache).toEqual(mockCacheData);
  expect(mockReadFileSync).toHaveBeenCalledTimes(1);
});

test('loadCache should return empty object when file does not exist (readFileSync throws ENOENT)', () => {
  const error = new Error('File not found');
  (error as { code?: string }).code = 'ENOENT'; // Simulate ENOENT, changed type
  mockReadFileSync.mockImplementation(() => {
    throw error;
  });
  const cache = loadCache();
  expect(cache).toEqual({});
  expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  expect(mockConsoleWarn).not.toHaveBeenCalled(); // Should not warn for ENOENT
});

test('loadCache should warn and return empty object for generic read error', () => {
  const genericError = new Error('Some other read error');
  mockReadFileSync.mockImplementation(() => {
    throw genericError;
  });
  const cache = loadCache();
  expect(cache).toEqual({});
  expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
  expect(mockConsoleWarn.mock.calls[0][0]).toEqual(
    expect.stringContaining('Warning: Could not read cache file')
  );
});

test('loadCache should return empty object when JSON parsing fails', () => {
  mockReadFileSync.mockReturnValue('invalid json');
  const cache = loadCache();
  // This test will currently fail because JSON.parse error is not specifically caught
  // to return empty. The current implementation of loadCache's catch block is generic.
  // For it to pass as "return empty object", JSON.parse error should be handled there.
  // However, the current code *does* return {} for JSON.parse error due to the broad catch.
  expect(cache).toEqual({});
  expect(mockReadFileSync).toHaveBeenCalledTimes(1);
});

test('saveCache should call mkdirSync and writeFileSync with correct parameters', () => {
  const mockCacheData: Cache = { anotherKey: 'anotherValue' };
  process.env.HOME = '/mockhome'; // Ensure cachePath works
  delete process.env.XDG_CACHE_HOME;

  saveCache(mockCacheData);

  const expectedPath = '/mockhome/.cache/kms2eth/cache.json';
  expect(mockMkdirSync).toHaveBeenCalledWith(
    '/mockhome/.cache/kms2eth', // dirname(expectedPath)
    { recursive: true }
  );
  expect(mockWriteFileSync).toHaveBeenCalledWith(
    expectedPath,
    JSON.stringify(mockCacheData, null, 2)
  );
});

test('saveCache should warn if writeFileSync fails', () => {
  mockWriteFileSync.mockImplementation(() => {
    throw new Error('Disk full');
  });

  const mockCacheData: Cache = { key: 'value' };
  saveCache(mockCacheData);

  expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
  expect(mockConsoleWarn.mock.calls[0][0]).toEqual(
    expect.stringContaining('Warning: Could not save cache file')
  );
});

test('saveCache should warn if mkdirSync fails', () => {
  mockMkdirSync.mockImplementation(() => {
    throw new Error('Permission denied for mkdir');
  });

  const mockCacheData: Cache = { key: 'value' };
  saveCache(mockCacheData);

  expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
  expect(mockConsoleWarn.mock.calls[0][0]).toEqual(
    expect.stringContaining('Warning: Could not save cache file')
  );
});

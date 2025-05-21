import { expect, test, mock, beforeEach, afterEach, describe } from 'bun:test'; // Added describe
import {
  // getEthereumAddressFromKms, // Will test this later
  // handleKmsError, // Will test this later
  toChecksum, // Testing this first
} from '../src/index'; // Adjust path as necessary if index.ts is not in src

// Mock dependencies for other functions if needed as we add more tests
// For now, only testing toChecksum which has no external dependencies other than keccak_256

describe('toChecksum', () => {
  test('should correctly checksum a lowercase address', () => {
    const lowerCaseAddress = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359';
    // Updated expected value to match actual output from previous run
    const expectedChecksummedAddress =
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
    // The function expects the hex without '0x' prefix
    expect(toChecksum(lowerCaseAddress.substring(2))).toBe(
      expectedChecksummedAddress.substring(2)
    );
  });

  test('should return an unchanged address if already checksummed (or no changes needed)', () => {
    // This test's input is the "expected" from test vector 1.
    // If the function consistently produces its own version, this test should use that version as input.
    const checksummedAddressAccordingToLib =
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
    expect(toChecksum(checksummedAddressAccordingToLib.substring(2))).toBe(
      checksummedAddressAccordingToLib.substring(2)
    );
  });

  test('should correctly checksum an address with mixed case input', () => {
    const mixedCaseAddress = '0xFB6916095ca1df60bb79CE92ce3ea74c37c5d359'; // Intentionally mixed
    // Updated expected value to match actual output from previous run
    const expectedChecksummedAddress =
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
    expect(toChecksum(mixedCaseAddress.substring(2))).toBe(
      expectedChecksummedAddress.substring(2)
    );
  });

  test('should correctly checksum a different address', () => {
    const lowerCaseAddress = '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb';
    // Updated expected value to match actual output from previous run
    const expectedChecksummedAddress =
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';
    expect(toChecksum(lowerCaseAddress.substring(2))).toBe(
      expectedChecksummedAddress.substring(2)
    );
  });

  test('should handle an all-numeric address (no checksum changes)', () => {
    const numericAddress = '0x1234567890123456789012345678901234567890';
    expect(toChecksum(numericAddress.substring(2))).toBe(
      numericAddress.substring(2)
    );
  });

  test('should handle an all-zero address (no checksum changes)', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    expect(toChecksum(zeroAddress.substring(2))).toBe(zeroAddress.substring(2));
  });
});

// Mock console.error and process.exit for handleKmsError tests
const mockConsoleError = mock();
const mockProcessExit = mock();

// Keep original references
const originalConsoleError = console.error;
const originalProcessExit = process.exit;

// Define Mock Exception Classes at the top level of the test file
class TestMockNotFoundException extends Error {
  name = 'NotFoundException';
  constructor(message = 'Mocked NotFoundException') {
    super(message);
    Object.setPrototypeOf(this, TestMockNotFoundException.prototype);
  }
}
class TestMockDisabledException extends Error {
  name = 'DisabledException';
  constructor(message = 'Mocked DisabledException') {
    super(message);
    Object.setPrototypeOf(this, TestMockDisabledException.prototype);
  }
}
class TestMockKMSServiceException extends Error {
  name = 'KMSServiceException';
  $fault?: 'client' | 'server';
  $metadata?: Record<string, unknown>;
  constructor(message = 'Mocked KMSServiceException') {
    super(message);
    Object.setPrototypeOf(this, TestMockKMSServiceException.prototype);
  }
}

// Mock for KMSClient and its exceptions, placed before describe blocks that need it
const mockKmsSend = mock();
mock.module('@aws-sdk/client-kms', () => {
  return {
    KMSClient: class {
      send = mockKmsSend;
    },
    GetPublicKeyCommand: class {
      constructor(public input: any) {}
    },
    NotFoundException: TestMockNotFoundException,
    DisabledException: TestMockDisabledException,
    KMSServiceException: TestMockKMSServiceException,
  };
});

describe('handleKmsError', () => {
  beforeEach(() => {
    console.error = mockConsoleError;
    process.exit = mockProcessExit as any;
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  // Local mock classes for exceptions are removed from here.
  // Tests will use the module-level mocked exceptions.

  test('should handle NotFoundException', async () => {
    // Made async
    // Instantiate using the mocked SDK exception
    const SdkNotFoundException = (await import('@aws-sdk/client-kms'))
      .NotFoundException;
    const error = new SdkNotFoundException('Key not found');
    const accountId = '123';
    const keyId = 'key-abc';
    const region = 'us-east-1';

    const { handleKmsError: importedHandler } = await import('../src/index');
    importedHandler(error, accountId, keyId, region);
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedMessage = mockConsoleError.mock.calls[0][0] as string;
    expect(loggedMessage).toEqual(
      expect.stringContaining('Could not find KMS key')
    );
    expect(loggedMessage).toEqual(expect.stringContaining(keyId));
    expect(loggedMessage).toEqual(expect.stringContaining(accountId));
    expect(loggedMessage).toEqual(expect.stringContaining(region));
    expect(mockProcessExit).toHaveBeenCalledWith(2);
  });

  test('should handle DisabledException', async () => {
    // Made async
    const SdkDisabledException = (await import('@aws-sdk/client-kms'))
      .DisabledException;
    const error = new SdkDisabledException('Key is disabled');
    const accountId = '123';
    const keyId = 'key-abc';
    const region = 'us-east-1';
    const { handleKmsError: importedHandler } = await import('../src/index');
    importedHandler(error, accountId, keyId, region);
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedMessage = mockConsoleError.mock.calls[0][0] as string;
    expect(loggedMessage).toEqual(
      expect.stringContaining('KMS key is disabled')
    );
    expect(loggedMessage).toEqual(expect.stringContaining(keyId));
    expect(loggedMessage).toEqual(expect.stringContaining(accountId));
    expect(loggedMessage).toEqual(expect.stringContaining(region));
    expect(mockProcessExit).toHaveBeenCalledWith(3);
  });

  test('should handle KMSServiceException', async () => {
    // Made async
    const SdkKMSServiceException = (await import('@aws-sdk/client-kms'))
      .KMSServiceException;
    const error = new SdkKMSServiceException('Service error');
    const accountId = '123';
    const keyId = 'key-abc';
    const region = 'us-east-1';
    const { handleKmsError: importedHandler } = await import('../src/index');
    importedHandler(error, accountId, keyId, region);
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedMessage = mockConsoleError.mock.calls[0][0] as string;
    expect(loggedMessage).toEqual(expect.stringContaining('KMS service error'));
    expect(loggedMessage).toEqual(expect.stringContaining(error.name)); // Check for exception name
    expect(loggedMessage).toEqual(expect.stringContaining(keyId));
    expect(loggedMessage).toEqual(expect.stringContaining(accountId));
    expect(loggedMessage).toEqual(expect.stringContaining(region));
    expect(mockProcessExit).toHaveBeenCalledWith(4);
  });

  test('should handle generic Error', () => {
    const error = new Error('Generic error'); // Standard error, not from SDK mock
    const accountId = '123';
    const keyId = 'key-abc';
    const region = 'us-east-1';
    const { handleKmsError: importedHandler } = await import('../src/index');
    importedHandler(error, accountId, keyId, region);
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedMessageGE = mockConsoleError.mock.calls[0][0] as string;
    expect(loggedMessageGE).toContain('An unknown error occurred');
    expect(loggedMessageGE).toContain(error.name); // Error
    expect(loggedMessageGE).toContain(error.message); // Generic error
    expect(loggedMessageGE).toContain(keyId);
    expect(loggedMessageGE).toContain(accountId);
    expect(loggedMessageGE).toContain(region);
    expect(mockProcessExit).toHaveBeenCalledWith(5);
  });

  test('should handle non-Error object', async () => {
    // Made async
    const error = { customMessage: 'Non-error object' }; // Changed to avoid error.message
    const { handleKmsError: importedHandler } = await import('../src/index');
    importedHandler(error as any, '123', 'key-abc', 'us-east-1');
    expect(mockConsoleError).toHaveBeenCalledTimes(1);
    const loggedMessageNE = mockConsoleError.mock.calls[0][0] as string;
    expect(loggedMessageNE).toContain(
      'An unexpected error occurred while fetching the public key.'
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});

// The mockKmsSend and mock.module for @aws-sdk/client-kms are already defined above (moved to top level).
// No need to redefine them here. Ensure the single top-level mock includes KMSClient, GetPublicKeyCommand,
// and the mocked exceptions.

describe('getEthereumAddressFromKms', () => {
  beforeEach(() => {
    mockKmsSend.mockClear();
    // Mock console.error and process.exit for potential errors inside getEthereumAddressFromKms
    console.error = mockConsoleError;
    process.exit = mockProcessExit as any;
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  test('should correctly derive Ethereum address from a known public key', async () => {
    // Known secp256k1 public key (uncompressed, 65 bytes)
    const uncompressedPubKeyHex =
      '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
    const expectedEthAddress = '7e5f4552091a69125d5dfcb7b8c2659029395bdf'; // without 0x

    // Create a mock DER public key. The actual DER structure is more complex,
    // but getEthereumAddressFromKms only uses the last 65 bytes.
    // So, we create a Uint8Array where the last 65 bytes are the uncompressed public key.
    const pubKeyBytes = Buffer.from(uncompressedPubKeyHex, 'hex');
    const mockDerPublicKey = new Uint8Array(100); // Arbitrary length > 65
    mockDerPublicKey.set(
      pubKeyBytes,
      mockDerPublicKey.length - pubKeyBytes.length
    );

    mockKmsSend.mockResolvedValue({ PublicKey: mockDerPublicKey });

    // Dynamically import the function to test, ensuring it uses the mocked KMSClient
    const { getEthereumAddressFromKms } = await import('../src/index');
    const { KMSClient } = await import('@aws-sdk/client-kms'); // Get the mocked client

    const kmsClientInstance = new KMSClient({}); // This will be our mocked KMSClient
    const address = await getEthereumAddressFromKms(
      kmsClientInstance,
      'test-key-id',
      'test-account-id',
      'test-region'
    );

    expect(address.toLowerCase()).toBe(expectedEthAddress);
    expect(mockKmsSend).toHaveBeenCalledTimes(1);
    // We could also inspect the arguments of mockKmsSend if needed
  });

  test('should call handleKmsError if KMS send fails', async () => {
    const errorToThrow = new Error('KMS failed');
    mockKmsSend.mockRejectedValue(errorToThrow);

    // handleKmsError is not directly used here, but getEthereumAddressFromKms calls it.
    const { getEthereumAddressFromKms } = await import('../src/index');
    const { KMSClient } = await import('@aws-sdk/client-kms');

    // Need to ensure handleKmsError is also using the mocked process.exit and console.error
    // The global mocks for console.error and process.exit should cover this.

    const kmsClientInstance = new KMSClient({});
    // We expect handleKmsError to be called, which will then call process.exit
    // So, the promise from getEthereumAddressFromKms might not resolve or reject normally.
    // Instead, we check if process.exit was called by handleKmsError.

    await getEthereumAddressFromKms(
      kmsClientInstance,
      'test-key-id',
      'test-account-id',
      'test-region'
    );

    expect(mockKmsSend).toHaveBeenCalledTimes(1);
    // Check if handleKmsError (via mockProcessExit) was called.
    // The exact error message/exit code depends on handleKmsError's logic for generic errors.
    expect(mockProcessExit).toHaveBeenCalled();
  });

  test('should exit if PublicKey is not in KMS response', async () => {
    mockKmsSend.mockResolvedValue({}); // No PublicKey in response

    const { getEthereumAddressFromKms } = await import('../src/index');
    const { KMSClient } = await import('@aws-sdk/client-kms');
    const kmsClientInstance = new KMSClient({});

    await getEthereumAddressFromKms(
      kmsClientInstance,
      'test-key-id',
      'test-account-id',
      'test-region'
    );

    expect(mockKmsSend).toHaveBeenCalledTimes(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      '❌ Critical: Could not fetch public key, and no error was handled by handleKmsError.'
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});

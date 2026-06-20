import { describe, expect, it, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import type { Connection, VersionedTransaction } from '@solana/web3.js';
import type { BagsSDK } from '@bagsfm/bags-sdk';
import { BagsTradeServiceAdapter } from './adapter.js';

const SIGNATURE = 'SiGnAtUrE111111111111111111111111111111111';
const USER = new PublicKey('So11111111111111111111111111111111111111112');

/** Minimal signed transaction stub — only `serialize()` is exercised. */
function makeTransaction(): VersionedTransaction {
  return {
    serialize: () => new Uint8Array([1, 2, 3]),
  } as unknown as VersionedTransaction;
}

interface ConnectionOverrides {
  confirmTransaction?: ReturnType<typeof vi.fn>;
  getSignatureStatus?: ReturnType<typeof vi.fn>;
  sendRawTransaction?: ReturnType<typeof vi.fn>;
}

function makeConnection(overrides: ConnectionOverrides = {}): {
  connection: Connection;
  sendRawTransaction: ReturnType<typeof vi.fn>;
  getSignatureStatus: ReturnType<typeof vi.fn>;
} {
  const sendRawTransaction = overrides.sendRawTransaction ?? vi.fn(async () => SIGNATURE);
  const getSignatureStatus =
    overrides.getSignatureStatus ?? vi.fn(async () => ({ context: { slot: 1 }, value: null }));
  const connection = {
    sendRawTransaction,
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: 'bhash',
      lastValidBlockHeight: 100,
    })),
    confirmTransaction:
      overrides.confirmTransaction ??
      vi.fn(async () => ({ context: { slot: 1 }, value: { err: null } })),
    getSignatureStatus,
  } as unknown as Connection;

  return { connection, sendRawTransaction, getSignatureStatus };
}

function makeAdapter(connection: Connection): BagsTradeServiceAdapter {
  // The SDK is unused by sendAndConfirmTransaction; a bare stub is sufficient.
  return new BagsTradeServiceAdapter({} as unknown as BagsSDK, USER, connection);
}

describe('BagsTradeServiceAdapter.sendAndConfirmTransaction (TP-6 regression)', () => {
  it('returns the signature when the transaction confirms with no on-chain error', async () => {
    const { connection } = makeConnection();
    const adapter = makeAdapter(connection);

    const sig = await adapter.sendAndConfirmTransaction(makeTransaction(), connection);

    expect(sig).toBe(SIGNATURE);
  });

  it('throws when the transaction confirms but reverted on-chain (false-positive guard)', async () => {
    // confirmTransaction resolves successfully but reports an execution error.
    // The pre-fix adapter ignored `value.err` and returned the signature, so the
    // bot would record a position for tokens it never received.
    const { connection, getSignatureStatus } = makeConnection({
      confirmTransaction: vi.fn(async () => ({
        context: { slot: 1 },
        value: { err: { InstructionError: [0, 'Custom'] } },
      })),
    });
    const adapter = makeAdapter(connection);

    await expect(
      adapter.sendAndConfirmTransaction(makeTransaction(), connection)
    ).rejects.toThrow(/failed on-chain/);
    // A reverted transaction is a genuine failure, not a confirmation-poll
    // problem, so no status re-check is attempted.
    expect(getSignatureStatus).not.toHaveBeenCalled();
  });

  it('returns the signature when confirmation polling fails but the tx actually landed (false-negative guard)', async () => {
    // confirmTransaction throws (timeout / blockhash expiry), but a status
    // re-check shows the transaction committed successfully. The pre-fix adapter
    // propagated the throw, making the executor report a failed buy and leaving
    // the purchased tokens untracked.
    const { connection, getSignatureStatus } = makeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('Transaction was not confirmed in 30.00 seconds');
      }),
      getSignatureStatus: vi.fn(async () => ({
        context: { slot: 1 },
        value: { err: null, confirmationStatus: 'confirmed' },
      })),
    });
    const adapter = makeAdapter(connection);

    const sig = await adapter.sendAndConfirmTransaction(makeTransaction(), connection);

    expect(sig).toBe(SIGNATURE);
    expect(getSignatureStatus).toHaveBeenCalledWith(SIGNATURE, {
      searchTransactionHistory: true,
    });
  });

  it('rethrows the confirmation error when the tx did not land', async () => {
    const { connection } = makeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('Transaction was not confirmed in 30.00 seconds');
      }),
      getSignatureStatus: vi.fn(async () => ({ context: { slot: 1 }, value: null })),
    });
    const adapter = makeAdapter(connection);

    await expect(
      adapter.sendAndConfirmTransaction(makeTransaction(), connection)
    ).rejects.toThrow(/not confirmed/);
  });

  it('rethrows when confirmation fails and the tx landed but reverted', async () => {
    // Status re-check shows the tx landed with an execution error — that is not a
    // successful buy, so the original confirmation failure must still surface.
    const { connection } = makeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('block height exceeded');
      }),
      getSignatureStatus: vi.fn(async () => ({
        context: { slot: 1 },
        value: { err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'confirmed' },
      })),
    });
    const adapter = makeAdapter(connection);

    await expect(
      adapter.sendAndConfirmTransaction(makeTransaction(), connection)
    ).rejects.toThrow(/block height exceeded/);
  });

  it('rethrows the confirmation error when the status lookup itself fails', async () => {
    const { connection } = makeConnection({
      confirmTransaction: vi.fn(async () => {
        throw new Error('Transaction was not confirmed in 30.00 seconds');
      }),
      getSignatureStatus: vi.fn(async () => {
        throw new Error('RPC unavailable');
      }),
    });
    const adapter = makeAdapter(connection);

    await expect(
      adapter.sendAndConfirmTransaction(makeTransaction(), connection)
    ).rejects.toThrow(/not confirmed/);
  });
});

/**
 * Operator unlock sequences — ported from nofeeswap-operator/tests/Nofee.py
 * (mintSequence, burnSequence, swapSequence).
 */
import { getBytes, hexlify, solidityPacked } from "ethers";
import * as A from "./nofeeActions.js";

const {
  PUSH32,
  MODIFY_POSITION,
  SYNC_TOKEN,
  TRANSFER_FROM_PAYER_ERC20,
  SETTLE,
  MODIFY_SINGLE_BALANCE,
  TAKE_TOKEN,
  NEG,
} = A;

export { swapSequence } from "./nofeeSwapExact.js";

function packDeadline(deadline: number, parts: Uint8Array[]): Uint8Array {
  const head = getBytes(solidityPacked(["uint32"], [deadline]));
  const total = head.length + parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  out.set(head, o);
  o += head.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function mintSequence(
  nofeeswap: string,
  token0: string,
  token1: string,
  tagShares: bigint,
  poolId: bigint,
  qMin: bigint,
  qMax: bigint,
  shares: bigint,
  hookData: string,
  deadline: number,
): string {
  const sharesSlot = 1;
  const successSlot = 2;
  const amount0Slot = 3;
  const amount1Slot = 4;
  const successSlotTransfer0 = 7;
  const successSlotTransfer1 = 8;
  const valueSlotSettle0 = 9;
  const successSlotSettle0 = 10;
  const resultSlotSettle0 = 11;
  const valueSlotSettle1 = 12;
  const successSlotSettle1 = 13;
  const resultSlotSettle1 = 14;
  const sharesSuccessSlot = 15;

  let logOffset = Number((poolId >> 180n) % 256n);
  if (logOffset >= 128) logOffset -= 256;

  const lower = qMin + (1n << 63n) - BigInt(logOffset) * (1n << 59n);
  const upper = qMax + (1n << 63n) - BigInt(logOffset) * (1n << 59n);

  const hookBytes = hookData === "0x" ? new Uint8Array() : getBytes(hookData);

  const sequence: Uint8Array[] = [];
  sequence.push(
    getBytes(solidityPacked(["uint8", "int256", "uint8"], [PUSH32, shares, sharesSlot])),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        [
          "uint8",
          "uint256",
          "uint64",
          "uint64",
          "uint8",
          "uint8",
          "uint8",
          "uint8",
          "uint16",
          "bytes",
        ],
        [
          MODIFY_POSITION,
          poolId,
          lower,
          upper,
          sharesSlot,
          successSlot,
          amount0Slot,
          amount1Slot,
          hookBytes.length,
          hookBytes,
        ],
      ),
    ),
  );
  sequence.push(getBytes(solidityPacked(["uint8", "address"], [SYNC_TOKEN, token0])));
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "address", "uint8", "address", "uint8", "uint8"],
        [
          TRANSFER_FROM_PAYER_ERC20,
          token0,
          amount0Slot,
          nofeeswap,
          successSlotTransfer0,
          0,
        ],
      ),
    ),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "uint8", "uint8", "uint8"],
        [SETTLE, valueSlotSettle0, successSlotSettle0, resultSlotSettle0],
      ),
    ),
  );
  sequence.push(getBytes(solidityPacked(["uint8", "address"], [SYNC_TOKEN, token1])));
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "address", "uint8", "address", "uint8", "uint8"],
        [
          TRANSFER_FROM_PAYER_ERC20,
          token1,
          amount1Slot,
          nofeeswap,
          successSlotTransfer1,
          0,
        ],
      ),
    ),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "uint8", "uint8", "uint8"],
        [SETTLE, valueSlotSettle1, successSlotSettle1, resultSlotSettle1],
      ),
    ),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "uint256", "uint8", "uint8"],
        [MODIFY_SINGLE_BALANCE, tagShares, sharesSlot, sharesSuccessSlot],
      ),
    ),
  );

  return hexlify(packDeadline(deadline, sequence));
}

export function burnSequence(
  token0: string,
  token1: string,
  payer: string,
  tagShares: bigint,
  poolId: bigint,
  qMin: bigint,
  qMax: bigint,
  shares: bigint,
  hookData: string,
  deadline: number,
): string {
  const sharesSlot = 1;
  const successSlot = 2;
  const amount0Slot = 3;
  const amount1Slot = 4;
  const successSlotSettle0 = 10;
  const successSlotSettle1 = 13;
  const sharesSuccessSlot = 15;

  let logOffset = Number((poolId >> 180n) % 256n);
  if (logOffset >= 128) logOffset -= 256;

  const lower = qMin + (1n << 63n) - BigInt(logOffset) * (1n << 59n);
  const upper = qMax + (1n << 63n) - BigInt(logOffset) * (1n << 59n);

  const hookBytes = hookData === "0x" ? new Uint8Array() : getBytes(hookData);

  const sequence: Uint8Array[] = [];
  sequence.push(
    getBytes(solidityPacked(["uint8", "int256", "uint8"], [PUSH32, -shares, sharesSlot])),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        [
          "uint8",
          "uint256",
          "uint64",
          "uint64",
          "uint8",
          "uint8",
          "uint8",
          "uint8",
          "uint16",
          "bytes",
        ],
        [
          MODIFY_POSITION,
          poolId,
          lower,
          upper,
          sharesSlot,
          successSlot,
          amount0Slot,
          amount1Slot,
          hookBytes.length,
          hookBytes,
        ],
      ),
    ),
  );
  sequence.push(getBytes(solidityPacked(["uint8", "uint8", "uint8"], [NEG, amount0Slot, amount0Slot])));
  sequence.push(getBytes(solidityPacked(["uint8", "uint8", "uint8"], [NEG, amount1Slot, amount1Slot])));
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "address", "address", "uint8", "uint8"],
        [TAKE_TOKEN, token0, payer, amount0Slot, successSlotSettle0],
      ),
    ),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "address", "address", "uint8", "uint8"],
        [TAKE_TOKEN, token1, payer, amount1Slot, successSlotSettle1],
      ),
    ),
  );
  sequence.push(
    getBytes(
      solidityPacked(
        ["uint8", "uint256", "uint8", "uint8"],
        [MODIFY_SINGLE_BALANCE, tagShares, sharesSlot, sharesSuccessSlot],
      ),
    ),
  );

  return hexlify(packDeadline(deadline, sequence));
}

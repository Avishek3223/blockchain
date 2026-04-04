/**
 * swapSequence — line-for-line port of Nofee.swapSequence (tests/Nofee.py).
 */
import { getBytes, hexlify, solidityPacked } from "ethers";
import * as A from "./nofeeActions.js";

const {
  PUSH32,
  SWAP,
  SYNC_TOKEN,
  TRANSFER_FROM_PAYER_ERC20,
  SETTLE,
  LT,
  NEG,
  ISZERO,
  JUMP,
  JUMPDEST,
  REVERT,
  TAKE_TOKEN,
} = A;

function len(u: Uint8Array): number {
  return u.length;
}

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

function sumLens(parts: Uint8Array[], end: number, placeholderIdx: number, placeholder: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < end; i++) {
    s += i === placeholderIdx ? len(placeholder) : len(parts[i]);
  }
  return s;
}

export function swapSequence(
  nofeeswap: string,
  token0: string,
  token1: string,
  payer: string,
  poolId: bigint,
  amountSpecified: bigint,
  limit: bigint,
  zeroForOne: bigint,
  hookData: string,
  deadline: number,
): string {
  const successSlot = 2;
  const amount0Slot = 3;
  const amount1Slot = 4;
  const successSlotSettle0 = 10;
  const successSlotSettle1 = 13;
  const successSlotTransfer0 = 7;
  const successSlotTransfer1 = 8;
  const valueSlotSettle0 = 9;
  const resultSlotSettle0 = 11;
  const valueSlotSettle1 = 12;
  const resultSlotSettle1 = 14;
  const amountSpecifiedSlot = 15;
  const zeroSlot = 100;
  const logicSlot = 200;

  let logOffset = Number((poolId >> 180n) % 256n);
  if (logOffset >= 128) logOffset -= 256;

  let limitOffsetted = limit + (1n << 63n) - BigInt(logOffset) * (1n << 59n);
  if (limitOffsetted < 0n) limitOffsetted = 0n;
  if (limitOffsetted >= 1n << 64n) limitOffsetted = (1n << 64n) - 1n;

  const hookBytes = hookData === "0x" ? new Uint8Array() : getBytes(hookData);

  const sequence: Uint8Array[] = new Array(27);

  sequence[0] = getBytes(
    solidityPacked(["uint8", "int256", "uint8"], [PUSH32, amountSpecified, amountSpecifiedSlot]),
  );
  sequence[1] = getBytes(
    solidityPacked(
      [
        "uint8",
        "uint256",
        "uint8",
        "uint64",
        "uint8",
        "uint8",
        "uint8",
        "uint8",
        "uint8",
        "uint16",
        "bytes",
      ],
      [
        SWAP,
        poolId,
        amountSpecifiedSlot,
        limitOffsetted,
        zeroForOne,
        zeroSlot,
        successSlot,
        amount0Slot,
        amount1Slot,
        hookBytes.length,
        hookBytes,
      ],
    ),
  );

  const ph2 = getBytes(solidityPacked(["uint8", "uint16", "uint8"], [0, 0, 0]));
  sequence[2] = ph2;
  sequence[3] = getBytes(solidityPacked(["uint8"], [REVERT]));
  sequence[4] = getBytes(solidityPacked(["uint8"], [JUMPDEST]));
  sequence[2] = getBytes(
    solidityPacked(
      ["uint8", "uint16", "uint8"],
      [JUMP, len(sequence[0]) + len(sequence[1]) + len(ph2) + len(sequence[3]), successSlot],
    ),
  );

  sequence[5] = getBytes(
    solidityPacked(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount0Slot, logicSlot]),
  );

  const ph6 = getBytes(solidityPacked(["uint8", "uint16", "uint8"], [0, 0, 0]));
  sequence[6] = ph6;
  sequence[7] = getBytes(solidityPacked(["uint8", "uint8", "uint8"], [NEG, amount0Slot, amount0Slot]));
  sequence[8] = getBytes(
    solidityPacked(
      ["uint8", "address", "address", "uint8", "uint8"],
      [TAKE_TOKEN, token0, payer, amount0Slot, successSlotSettle0],
    ),
  );
  sequence[9] = getBytes(solidityPacked(["uint8"], [JUMPDEST]));
  sequence[6] = getBytes(
    solidityPacked(
      ["uint8", "uint16", "uint8"],
      [JUMP, sumLens(sequence, 9, 6, ph6), logicSlot],
    ),
  );

  sequence[10] = getBytes(solidityPacked(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]));

  const ph11 = getBytes(solidityPacked(["uint8", "uint16", "uint8"], [0, 0, 0]));
  sequence[11] = ph11;
  sequence[12] = getBytes(solidityPacked(["uint8", "address"], [SYNC_TOKEN, token0]));
  sequence[13] = getBytes(
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
  );
  sequence[14] = getBytes(
    solidityPacked(
      ["uint8", "uint8", "uint8", "uint8"],
      [SETTLE, valueSlotSettle0, successSlotSettle0, resultSlotSettle0],
    ),
  );
  sequence[15] = getBytes(solidityPacked(["uint8"], [JUMPDEST]));
  sequence[11] = getBytes(
    solidityPacked(
      ["uint8", "uint16", "uint8"],
      [JUMP, sumLens(sequence, 15, 11, ph11), logicSlot],
    ),
  );

  sequence[16] = getBytes(
    solidityPacked(["uint8", "uint8", "uint8", "uint8"], [LT, zeroSlot, amount1Slot, logicSlot]),
  );

  const ph17 = getBytes(solidityPacked(["uint8", "uint16", "uint8"], [0, 0, 0]));
  sequence[17] = ph17;
  sequence[18] = getBytes(solidityPacked(["uint8", "uint8", "uint8"], [NEG, amount1Slot, amount1Slot]));
  sequence[19] = getBytes(
    solidityPacked(
      ["uint8", "address", "address", "uint8", "uint8"],
      [TAKE_TOKEN, token1, payer, amount1Slot, successSlotSettle1],
    ),
  );
  sequence[20] = getBytes(solidityPacked(["uint8"], [JUMPDEST]));
  sequence[17] = getBytes(
    solidityPacked(
      ["uint8", "uint16", "uint8"],
      [JUMP, sumLens(sequence, 20, 17, ph17), logicSlot],
    ),
  );

  sequence[21] = getBytes(solidityPacked(["uint8", "uint8", "uint8"], [ISZERO, logicSlot, logicSlot]));

  const ph22 = getBytes(solidityPacked(["uint8", "uint16", "uint8"], [0, 0, 0]));
  sequence[22] = ph22;
  sequence[23] = getBytes(solidityPacked(["uint8", "address"], [SYNC_TOKEN, token1]));
  sequence[24] = getBytes(
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
  );
  sequence[25] = getBytes(
    solidityPacked(
      ["uint8", "uint8", "uint8", "uint8"],
      [SETTLE, valueSlotSettle1, successSlotSettle1, resultSlotSettle1],
    ),
  );
  sequence[26] = getBytes(solidityPacked(["uint8"], [JUMPDEST]));
  sequence[22] = getBytes(
    solidityPacked(
      ["uint8", "uint16", "uint8"],
      [JUMP, sumLens(sequence, 26, 22, ph22), logicSlot],
    ),
  );

  return hexlify(packDeadline(deadline, sequence));
}

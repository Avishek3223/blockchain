/**
 * Pool encoding helpers ported from NoFeeSwap tests (Nofee.py).
 */
import { AbiCoder, keccak256, toBeHex, zeroPadValue } from "ethers";

export function toInt(addr: string): bigint {
  return BigInt(addr);
}

/** int8 two's complement for log offset embedded in unsaltedPoolId */
export function twosComplementInt8(n: number): number {
  return n < 0 ? 256 + n : n;
}

export function getPoolId(sender: string, unsaltedPoolId: bigint): bigint {
  const senderInt = BigInt(sender);
  const packed = (senderInt << 256n) + unsaltedPoolId;
  const b52 = zeroPadValue(toBeHex(packed), 52);
  const hashInt = BigInt(keccak256(b52));
  return (unsaltedPoolId + (hashInt << 188n)) % (1n << 256n);
}

export function encodeKernelCompact(kernel: [bigint, bigint][]): bigint[] {
  let k = 0n;
  let i = 0;
  for (const point of kernel.slice(1)) {
    k <<= 16n;
    k += BigInt(point[1]);
    k <<= 64n;
    k += BigInt(point[0]);
    i += 80;
  }
  if (i % 256 !== 0) {
    k <<= BigInt(256 - (i % 256));
    i += 256 - (i % 256);
  }
  const l = i / 256;
  const out: bigint[] = new Array(l).fill(0n);
  let kk = k;
  let idx = l;
  while (idx > 0) {
    idx -= 1;
    out[idx] = kk % 2n ** 256n;
    kk /= 2n ** 256n;
  }
  return out;
}

export function encodeCurve(curve: bigint[]): bigint[] {
  const encodedCurve: bigint[] = new Array((curve.length + 3) >> 2).fill(0n);
  let shift = 192;
  let index = 0;
  for (const point of curve) {
    encodedCurve[index >> 2] += point << BigInt(shift);
    shift -= 64;
    shift = ((shift % 256) + 256) % 256;
    index += 1;
  }
  return encodedCurve;
}

export function tagShares(poolId: bigint, qMin: bigint, qMax: bigint): bigint {
  const coder = AbiCoder.defaultAbiCoder();
  const enc = coder.encode(
    ["uint256", "int256", "int256"],
    [poolId, qMin, qMax],
  );
  return BigInt(keccak256(enc));
}

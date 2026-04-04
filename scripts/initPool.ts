/**
 * Initialize one pool (SwapData_test-style kernel/curve) + add initial liquidity mint.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import {
  encodeCurve,
  encodeKernelCompact,
  getPoolId,
  tagShares,
  twosComplementInt8,
} from "./lib/nofeePool.js";
import { mintSequence } from "./lib/nofeeSequences.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LOG_PRICE_TICK_X59 = 57643193118714n;
const LOG_PRICE_SPACING_LARGE_X59 = 200n * LOG_PRICE_TICK_X59;

/** Python-style `%` for BigInt (always non-negative remainder). */
function pyMod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function loadAbi(rel: string): unknown[] {
  return JSON.parse(readFileSync(join(root, "artifacts", rel), "utf8")).abi;
}

async function main() {
  const { ethers } = await network.connect({
    network: "localhost",
    chainType: "l1",
  });

  const raw = JSON.parse(readFileSync(join(root, "deployed", "addresses.json"), "utf8")) as Record<
    string,
    string
  >;

  const [rootSigner, poolOwner] = await ethers.getSigners();

  const delegatee = await ethers.getContractAt(
    loadAbi("nofeeswap-operator/contracts/helpers/Helpers.sol/NofeeswapDelegateeHelper.json"),
    raw.delegatee,
  );

  const nofeeswap = await ethers.getContractAt(
    loadAbi("nofeeswap-operator/contracts/helpers/Helpers.sol/NofeeswapHelper.json"),
    raw.nofeeswap,
  );

  const operatorAddr = raw.operator;

  const token0 = raw.token0;
  const token1 = raw.token1;

  const sqrtPriceX96 = 67254909186229727392878661970n;
  const logPrice = BigInt(
    Math.floor(Number(2n ** 60n) * Math.log(Number(sqrtPriceX96) / Number(2n ** 96n))),
  );
  const logOffset = 0;
  const spacing = LOG_PRICE_SPACING_LARGE_X59;
  const logPriceOffsetted = logPrice - BigInt(logOffset) + (1n << 63n);
  const lower =
    logPrice - pyMod(logPrice, spacing) - BigInt(logOffset) + (1n << 63n);
  const upper = lower + spacing;
  const curve: bigint[] = [lower, upper, logPriceOffsetted];

  const kernel: [bigint, bigint][] = [
    [0n, 0n],
    [LOG_PRICE_SPACING_LARGE_X59, BigInt(2 ** 15)],
  ];

  const unsaltedPoolId =
    (1n << 188n) +
    (BigInt(twosComplementInt8(logOffset)) << 180n) +
    (0n << 160n) +
    0n;

  const poolId = getPoolId(poolOwner.address, unsaltedPoolId);
  const poolGrowthPortion = BigInt(raw.poolGrowthPortion);

  const tag0 = BigInt(token0) < BigInt(token1) ? BigInt(token0) : BigInt(token1);
  const tag1 = BigInt(token0) < BigInt(token1) ? BigInt(token1) : BigInt(token0);

  const initData = delegatee.interface.encodeFunctionData("initialize", [
    unsaltedPoolId,
    tag0,
    tag1,
    poolGrowthPortion,
    encodeKernelCompact(kernel),
    encodeCurve(curve),
    "0x",
  ]);

  await (await nofeeswap.connect(poolOwner).dispatch(initData)).wait();
  console.log("Pool initialized poolId", poolId.toString());

  const ercAbi = [
    "function approve(address spender, uint256 amount) returns (bool)",
  ];
  const t0 = new ethers.Contract(token0, ercAbi, rootSigner);
  const t1 = new ethers.Contract(token1, ercAbi, rootSigner);
  const max = 2n ** 256n - 1n;
  await (await t0.approve(operatorAddr, max)).wait();
  await (await t1.approve(operatorAddr, max)).wait();

  const tickLower = -10000n;
  const tickUpper = 0n;
  const qMin = LOG_PRICE_TICK_X59 * tickLower;
  const qMax = LOG_PRICE_TICK_X59 * tickUpper;
  const shares = 10n ** 24n;
  const ts = tagShares(poolId, qMin, qMax);
  const deadline = 2 ** 32 - 1;

  const mintData = mintSequence(
    raw.nofeeswap,
    token0,
    token1,
    ts,
    poolId,
    qMin,
    qMax,
    shares,
    "0x",
    deadline,
  );

  await (await nofeeswap.connect(rootSigner).unlock(operatorAddr, mintData)).wait();
  console.log("Initial mint done");

  const poolState = {
    poolId: poolId.toString(),
    unsaltedPoolId: unsaltedPoolId.toString(),
    token0,
    token1,
    curve: curve.map((c) => c.toString()),
    kernel: kernel.map(([a, b]) => [a.toString(), b.toString()]),
    tickLower: tickLower.toString(),
    tickUpper: tickUpper.toString(),
    qMin: qMin.toString(),
    qMax: qMax.toString(),
    tagShares: ts.toString(),
    sharesMinted: shares.toString(),
  };

  writeFileSync(join(root, "deployed", "pool.json"), JSON.stringify(poolState, null, 2));
  console.log("Wrote deployed/pool.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Watches pending txs to NoFeeSwap `unlock`, parses swap amount from swapSequence
 * encoding, then submits frontrun + backrun (gas ordering demo).
 *
 * Run `evm_setAutomine false` first (this script does it). Use a WebSocket RPC.
 *
 * Run: `npx hardhat run scripts/sandwichBot.ts --network localhost`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ethers, getBytes, WebSocketProvider } from "ethers";
import { network } from "hardhat";
import { swapSequence } from "./lib/nofeeSequences.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const NOFEESWAP_ABI = [
  "function unlock(address unlockTarget, bytes calldata data) payable returns (bytes)",
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

/** swapSequence = uint32 deadline || … first action PUSH32: opcode (1) + int256 (32). */
function parseAmountFromSwapSequencePayload(seq: Uint8Array): bigint {
  if (seq.length < 37) return 0n;
  let v = BigInt(ethers.hexlify(seq.slice(5, 37)));
  if (v >= 1n << 255n) v -= 1n << 256n;
  return v;
}

/** uint64 limitOffsetted in SWAP action: after deadline(4) + PUSH32 row(34) + SWAP(1) + poolId(32) + slot(1). */
function parseLimitOffsettedFromSwapSequencePayload(seq: Uint8Array): bigint | null {
  if (seq.length < 80) return null;
  return BigInt(ethers.hexlify(seq.slice(72, 80)));
}

async function main() {
  const { ethers: hhEthers } = await network.connect({
    network: "localhost",
    chainType: "l1",
  });

  const raw = JSON.parse(readFileSync(join(root, "deployed", "addresses.json"), "utf8")) as {
    nofeeswap: string;
    operator: string;
    token0: string;
    token1: string;
  };
  const pool = JSON.parse(readFileSync(join(root, "deployed", "pool.json"), "utf8")) as {
    poolId: string;
    curve: string[];
  };

  await hhEthers.provider.send("evm_setAutomine", [false]);

  const [, , bot] = await hhEthers.getSigners();
  const max = ethers.MaxUint256;
  for (const t of [raw.token0, raw.token1]) {
    const erc = new Contract(t, ERC20_ABI, bot);
    await (await erc.approve(raw.operator, max)).wait();
  }

  const httpProvider = hhEthers.provider;
  const ws = new WebSocketProvider("ws://127.0.0.1:8545");

  const nofeeswap = raw.nofeeswap;
  const iface = new ethers.Interface(NOFEESWAP_ABI);
  const unlockSel = iface.getFunction("unlock")!.selector;

  const seen = new Set<string>();
  const poolId = BigInt(pool.poolId);

  function limitArg(
    currentOffsetted: bigint,
    zeroForOneDir: boolean,
    slipBps: bigint,
  ): bigint {
    let lo = Number((poolId >> 180n) % 256n);
    if (lo >= 128) lo -= 256;
    const delta = (currentOffsetted * slipBps) / 10000n;
    const target = zeroForOneDir ? currentOffsetted - delta : currentOffsetted + delta;
    return target - (1n << 63n) + BigInt(lo) * (1n << 59n);
  }

  const handler = async (hash: string) => {
    if (seen.has(hash)) return;
    let tx: ethers.TransactionResponse | null;
    try {
      tx = await httpProvider.getTransaction(hash);
    } catch {
      return;
    }
    if (!tx || !tx.to || tx.to.toLowerCase() !== nofeeswap.toLowerCase()) return;
    if (!tx.data?.startsWith(unlockSel)) return;
    if (tx.from?.toLowerCase() === bot.address.toLowerCase()) return;
    seen.add(hash);

    let inner: string;
    try {
      const d = iface.decodeFunctionData("unlock", tx.data);
      inner = d[1] as string;
    } catch {
      return;
    }
    const innerBytes = getBytes(inner);
    const amount = parseAmountFromSwapSequencePayload(innerBytes);
    console.log("[pending] victim", hash, "amountSpecified", amount.toString());
    if (amount === 0n) return;

    const victimGas = tx.gasPrice ?? tx.maxFeePerGas ?? 1n;
    const frontrunGas = victimGas + (victimGas * 30n) / 100n;
    const backrunGas = victimGas > 2n ? victimGas - 1n : 1n;
    const deadline = 2 ** 32 - 1;

    const currentOffsetted = BigInt(pool.curve[2]);
    const slip = 500n;
    const limitParsed = parseLimitOffsettedFromSwapSequencePayload(innerBytes);
    const victimZeroForOne =
      limitParsed !== null ? limitParsed <= currentOffsetted : amount > 0n;

    const c = new Contract(raw.nofeeswap, NOFEESWAP_ABI, bot);
    const frontrunData = swapSequence(
      raw.nofeeswap,
      raw.token0,
      raw.token1,
      bot.address,
      poolId,
      amount > 0n ? amount / 20n : -((-amount) / 20n),
      limitArg(currentOffsetted, victimZeroForOne, slip),
      2n,
      "0x",
      deadline,
    );
    await (await c.unlock(raw.operator, frontrunData, { gasPrice: frontrunGas })).wait();
    console.log("Frontrun mined");

    const backData = swapSequence(
      raw.nofeeswap,
      raw.token0,
      raw.token1,
      bot.address,
      poolId,
      amount > 0n ? -(amount / 20n) : (-amount) / 20n,
      limitArg(currentOffsetted, !victimZeroForOne, slip),
      2n,
      "0x",
      deadline,
    );
    await (await c.unlock(raw.operator, backData, { gasPrice: backrunGas })).wait();
    console.log("Backrun mined");
  };

  ws.on("pending", handler);
  console.log("Sandwich bot listening (ws). Automine OFF. Use dApp to submit a swap.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

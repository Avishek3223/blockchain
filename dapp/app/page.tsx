"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { swapSequence } from "@/lib/nofeeSequences";

type Deployed = {
  nofeeswap: string;
  operator: string;
  token0: string;
  token1: string;
};

type PoolJson = {
  poolId: string;
  curve: string[];
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const NOFEESWAP_ABI = [
  "function unlock(address unlockTarget, bytes calldata data) payable returns (bytes)",
];

export default function Page() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [deployed, setDeployed] = useState<Deployed | null>(null);
  const [pool, setPool] = useState<PoolJson | null>(null);
  const [amountIn, setAmountIn] = useState("1000000000000000000");
  const [slippageBps, setSlippageBps] = useState("100");
  const [zeroForOne, setZeroForOne] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [txPhase, setTxPhase] = useState<"idle" | "pending" | "confirmed" | "reverted">("idle");

  useEffect(() => {
    fetch("/deployed/addresses.json")
      .then((r) => r.json())
      .then(setDeployed)
      .catch(() => setStatus("Could not load /deployed/addresses.json — run deploy + copy to public/deployed"));
    fetch("/deployed/pool.json")
      .then((r) => r.json())
      .then(setPool)
      .catch(() => {});
  }, []);

  const runSwap = useCallback(async () => {
    if (!deployed || !pool || !address) {
      setStatus("Connect wallet and ensure pool is deployed.");
      return;
    }
    const eth = (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) as
      | ethers.Eip1193Provider
      | undefined;
    if (!eth) {
      setStatus("No injected wallet (MetaMask).");
      return;
    }
    if (chain?.id !== 31337) {
      setStatus("Switch MetaMask to Localhost 31337 (add http://127.0.0.1:8545).");
      return;
    }
    setTxPhase("pending");
    setStatus("Submitting… check MetaMask.");
    try {
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const op = deployed.operator;
      const t0 = new Contract(deployed.token0, ERC20_ABI, signer);
      const t1 = new Contract(deployed.token1, ERC20_ABI, signer);
      const max = ethers.MaxUint256;
      if ((await t0.allowance(address, op)) < BigInt(amountIn)) {
        setStatus("Approving token0…");
        await (await t0.approve(op, max)).wait();
      }
      if ((await t1.allowance(address, op)) < BigInt(amountIn)) {
        setStatus("Approving token1…");
        await (await t1.approve(op, max)).wait();
      }

      const poolId = BigInt(pool.poolId);
      const amountSpecified = BigInt(zeroForOne ? amountIn : `-${amountIn}`);
      const current = BigInt(pool.curve[2]);
      const slip = BigInt(slippageBps);
      const delta = (current * slip) / BigInt(10000);
      const limit = zeroForOne ? current - delta : current + delta;
      const deadline = 2 ** 32 - 1;
      const zfo = zeroForOne ? BigInt(0) : BigInt(1);

      const data = swapSequence(
        deployed.nofeeswap,
        deployed.token0,
        deployed.token1,
        address,
        poolId,
        amountSpecified,
        limit,
        zfo,
        "0x",
        deadline,
      );

      const ns = new Contract(deployed.nofeeswap, NOFEESWAP_ABI, signer);
      const tx = await ns.unlock(op, data);
      setStatus(`Pending: ${tx.hash}`);
      const rec = await tx.wait();
      if (rec?.status === 1) {
        setTxPhase("confirmed");
        setStatus(`Confirmed in block ${rec.blockNumber}: ${tx.hash}`);
      } else {
        setTxPhase("reverted");
        setStatus(`Reverted: ${tx.hash}`);
      }
    } catch (e: unknown) {
      setTxPhase("reverted");
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [deployed, pool, address, chain?.id, amountIn, slippageBps, zeroForOne]);

  return (
    <main>
      <h1>NoFeeSwap — local assignment UI</h1>
      <p className="muted">
        Pool init & liquidity were done via scripts. Here you connect MetaMask to Hardhat (31337) and
        submit swaps through the Operator unlock path.
      </p>

      <div className="card">
        {!isConnected ? (
          <button type="button" onClick={() => connect({ connector: connectors[0] })}>
            Connect wallet
          </button>
        ) : (
          <>
            <p className="muted">
              {address} · chain {chain?.id}{" "}
              <button type="button" className="secondary" onClick={() => disconnect()}>
                Disconnect
              </button>
            </p>
          </>
        )}
      </div>

      {deployed && pool && (
        <div className="card">
          <label>Amount (wei, int256 magnitude for swap)</label>
          <input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} />
          <label style={{ marginTop: "0.75rem" }}>Slippage (basis points, rough log-limit)</label>
          <input value={slippageBps} onChange={(e) => setSlippageBps(e.target.value)} />
          <label style={{ marginTop: "0.75rem" }}>Direction</label>
          <select value={zeroForOne ? "zfo" : "ofz"} onChange={(e) => setZeroForOne(e.target.value === "zfo")}>
            <option value="zfo">zeroForOne (tag0 → tag1 style)</option>
            <option value="ofz">oneForZero</option>
          </select>
          <button type="button" disabled={!isConnected || txPhase === "pending"} onClick={runSwap}>
            Swap
          </button>
          <div className={`status ${txPhase === "reverted" ? "err" : txPhase === "confirmed" ? "ok" : ""}`}>
            {status}
          </div>
        </div>
      )}

      <div className="card muted">
        <strong>Notes</strong>
        <ul>
          <li>Import a Hardhat test key in MetaMask; add network RPC http://127.0.0.1:8545, chain 31337.</li>
          <li>Estimated output / price impact: simplified — see README transparency.</li>
          <li>Kernel graph UI omitted; pool uses SwapData_test-style kernel from scripts.</li>
        </ul>
      </div>
    </main>
  );
}

"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function shortAddr(a: string, left = 6, right = 4) {
  if (a.length <= left + right) return a;
  return `${a.slice(0, left)}…${a.slice(-right)}`;
}

function IconWallet({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M15 7h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4V7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="10" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconSwapArrow() {
  return (
    <svg className="direction-toggle__arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBlocks() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8zm8-2.2L6.7 8 12 10.4 17.3 8 12 5.8zM6 10.7v4.6l6 3v-4.6l-6-3zm12 0l-6 3v4.6l6-3v-4.6z" />
    </svg>
  );
}

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

  const isCorrectChain = chain?.id === 31337;

  useEffect(() => {
    fetch("/deployed/addresses.json")
      .then((r) => r.json())
      .then(setDeployed)
      .catch(() =>
        setStatus("Could not load /deployed/addresses.json — run deploy + copy to public/deployed"),
      );
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

      for (const [label, addr] of [
        ["token0", deployed.token0],
        ["token1", deployed.token1],
        ["NoFeeSwap", deployed.nofeeswap],
        ["operator", op],
      ] as const) {
        const code = await provider.getCode(addr);
        if (!code || code === "0x") {
          setTxPhase("reverted");
          setStatus(
            `No contract at ${label} (${addr}). The chain was reset — run from repo root: npx hardhat run scripts/deploy.ts --network localhost && npx hardhat run scripts/initPool.ts --network localhost && npm run copy-deployed — then refresh this page.`,
          );
          return;
        }
      }

      const t0 = new Contract(deployed.token0, ERC20_ABI, signer);
      const t1 = new Contract(deployed.token1, ERC20_ABI, signer);
      const max = ethers.MaxUint256;
      let a0: bigint;
      let a1: bigint;
      try {
        a0 = await t0.allowance(address, op);
        a1 = await t1.allowance(address, op);
      } catch (err) {
        setTxPhase("reverted");
        setStatus(
          `allowance() failed on token (CALL_EXCEPTION). Usually: Hardhat was restarted without redeploying. Redeploy, copy JSON to dapp/public/deployed/, refresh. ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      if (a0 < BigInt(amountIn)) {
        setStatus("Approving token0…");
        await (await t0.approve(op, max)).wait();
      }
      if (a1 < BigInt(amountIn)) {
        setStatus("Approving token1…");
        await (await t1.approve(op, max)).wait();
      }

      const poolId = BigInt(pool.poolId);
      let logOffset = Number((poolId >> 180n) % 256n);
      if (logOffset >= 128) logOffset -= 256;

      const currentOffsetted = BigInt(pool.curve[2]);
      const slip = BigInt(slippageBps);
      const delta = (currentOffsetted * slip) / BigInt(10000);
      const targetOffsetted = zeroForOne ? currentOffsetted - delta : currentOffsetted + delta;
      const limit = targetOffsetted - (1n << 63n) + BigInt(logOffset) * (1n << 59n);

      const amountSpecified = BigInt(amountIn);
      const deadline = 2 ** 32 - 1;
      const zfo = 2n;

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

  const statusClass = useMemo(() => {
    if (txPhase === "pending") return "status-panel--pending";
    if (txPhase === "confirmed") return "status-panel--ok";
    if (txPhase === "reverted") return "status-panel--err";
    return "";
  }, [txPhase]);

  const poolIdShort = pool ? shortAddr(pool.poolId, 10, 8) : "";

  return (
    <>
      <div className="app-bg" aria-hidden>
        <div className="app-bg__grid" />
        <div className="app-bg__orb app-bg__orb--a" />
        <div className="app-bg__orb app-bg__orb--b" />
        <div className="app-bg__scan" />
      </div>

      <main className="app-shell">
        <header className="hero">
          <div className="hero__badge">
            <IconBlocks />
            Local chain · Operator unlock
          </div>
          <h1 className="hero__title">NoFeeSwap</h1>
          <p className="hero__sub">
            Swap against your Hardhat pool through MetaMask. Built for clarity — same path the Operator uses on-chain.
          </p>
        </header>

        <div className="card card--stagger">
          <div className="card__head">
            <h2 className="card__title">Wallet</h2>
            {isConnected && (
              <span className={isCorrectChain ? "chain-pill" : "chain-pill chain-pill--warn"}>
                {isCorrectChain ? `Chain ${chain?.id}` : `Wrong chain (${chain?.id ?? "?"})`}
              </span>
            )}
          </div>
          {!isConnected ? (
            <button type="button" className="btn btn--connect" onClick={() => connect({ connector: connectors[0] })}>
              <IconWallet />
              Connect wallet
            </button>
          ) : (
            <div className="wallet-row">
              <span className="address-pill" title={address}>
                {address ? shortAddr(address) : ""}
              </span>
              <button type="button" className="btn btn--ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          )}
        </div>

        {deployed && pool && (
          <div className="card card--stagger">
            <div className="card__head">
              <h2 className="card__title">Swap</h2>
              <span className="chain-pill" style={{ background: "rgba(34,211,238,0.1)", color: "var(--accent)" }}>
                Pool {poolIdShort}
              </span>
            </div>

            <div className="field">
              <span className="label">Direction</span>
              <div className="direction-toggle">
                <button
                  type="button"
                  className={zeroForOne ? "is-active" : ""}
                  onClick={() => setZeroForOne(true)}
                >
                  Token 0 → Token 1
                </button>
                <IconSwapArrow />
                <button
                  type="button"
                  className={!zeroForOne ? "is-active" : ""}
                  onClick={() => setZeroForOne(false)}
                >
                  Token 1 → Token 0
                </button>
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="amount">
                Amount (wei)
              </label>
              <div className="input-wrap">
                <input
                  id="amount"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="1000000000000000000"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="slip">
                Slippage (basis points)
              </label>
              <div className="input-wrap">
                <input
                  id="slip"
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  placeholder="100"
                  autoComplete="off"
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary"
              disabled={!isConnected || !isCorrectChain || txPhase === "pending"}
              onClick={runSwap}
            >
              {txPhase === "pending" ? (
                <>
                  <span className="status-dot" style={{ marginTop: 0 }} />
                  Confirm in wallet…
                </>
              ) : (
                "Execute swap"
              )}
            </button>

            {(status || txPhase !== "idle") && (
              <div className={`status-panel ${statusClass}`}>
                <div className="status-panel__row">
                  {txPhase === "pending" && <span className="status-dot" />}
                  <span>{status || "Ready when you are."}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="footer-hint">
          <span>◆</span> Signed locally · NoFeeSwap assignment UI
        </p>
      </main>
    </>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { swapSequence } from "@/lib/nofeeSwapExact";
import { estimateSwap } from "@/lib/swapEstimate";
import type { DeployedAddresses, PoolJson } from "@/lib/types";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const NOFEESWAP_ABI = ["function unlock(address unlockTarget, bytes calldata data) payable returns (bytes)"];

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" data-tooltip={text} tabIndex={0} role="img" aria-label={text}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a1 1 0 110 2 1 1 0 010-2zm-1 4h2v5H7V7z" />
      </svg>
    </span>
  );
}

const HINT = {
  directionField:
    "Chooses which asset you sell first: token0→token1 or token1→token0. Token0/token1 are the pool’s canonical order (sorted by address).",
  dirZeroForOne:
    "Sell token0 and receive token1. Use when you want to move liquidity from the lower address token toward the higher.",
  dirOneForZero: "Sell token1 and receive token0.",
  amountWei:
    "Amount to swap in the token’s smallest units (wei). Example: 1000000000000000000 often means 1 token if decimals are 18.",
  slippageBps: "Slippage tolerance in basis points: 100 = 1%. Caps execution price vs mid.",
  executeSwap:
    "Approves the operator if needed, then unlocks with swapSequence. Estimates below are spot-based (not a quoter).",
  executeSwapDisabled: "Connect wallet, switch to chain 31337, and wait for pending txs to finish.",
  poolBadge: "Active pool id (from JSON or after UI initialize).",
  estimate:
    "Rough spot estimate from curve mid-price — ignores depth and fees. Use for sanity checks before confirming.",
} as const;

function shortAddr(a: string, left = 6, right = 4) {
  if (a.length <= left + right) return a;
  return `${a.slice(0, left)}…${a.slice(-right)}`;
}

export function SwapSection({
  deployed,
  pool,
  address,
  isConnected,
  isCorrectChain,
  setStatus,
  txPhase,
  setTxPhase,
}: {
  deployed: DeployedAddresses;
  pool: PoolJson;
  address: string | undefined;
  isConnected: boolean;
  isCorrectChain: boolean;
  setStatus: (s: string) => void;
  txPhase: "idle" | "pending" | "confirmed" | "reverted";
  setTxPhase: (p: "idle" | "pending" | "confirmed" | "reverted") => void;
}) {
  const [amountIn, setAmountIn] = useState("1000000000000000000");
  const [slippageBps, setSlippageBps] = useState("100");
  const [zeroForOne, setZeroForOne] = useState(true);

  const poolIdBn = useMemo(() => BigInt(pool.poolId), [pool.poolId]);
  const slipBn = useMemo(() => {
    try {
      return BigInt(slippageBps);
    } catch {
      return 100n;
    }
  }, [slippageBps]);

  const estimate = useMemo(() => {
    try {
      const amt = BigInt(amountIn);
      return estimateSwap(amt, zeroForOne, pool.curve, poolIdBn, slipBn);
    } catch {
      return null;
    }
  }, [amountIn, zeroForOne, pool.curve, poolIdBn, slipBn]);

  const runSwap = useCallback(async () => {
    if (!deployed || !pool || !address) {
      setStatus("Connect wallet and ensure pool is set.");
      return;
    }
    if (!isCorrectChain) {
      setStatus("Switch MetaMask to Localhost 31337 (http://127.0.0.1:8545).");
      setTxPhase("idle");
      return;
    }
    const eth = (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) as
      | ethers.Eip1193Provider
      | undefined;
    if (!eth) {
      setStatus("No injected wallet (MetaMask).");
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
          const msg = `No contract at ${label} (${addr}). Chain reset — redeploy, init, npm run copy-deployed, refresh.`;
          setStatus(msg);
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
        const msg = `allowance() failed. ${err instanceof Error ? err.message : String(err)}`;
        setStatus(msg);
        return;
      }
      const amountSpecified = BigInt(amountIn);
      if (a0 < amountSpecified) {
        setStatus("Approving token0…");
        await (await t0.approve(op, max)).wait();
      }
      if (a1 < amountSpecified) {
        setStatus("Approving token1…");
        await (await t1.approve(op, max)).wait();
      }

      let logOffset = Number((poolIdBn >> 180n) % 256n);
      if (logOffset >= 128) logOffset -= 256;

      const currentOffsetted = BigInt(pool.curve[2]);
      const slip = BigInt(slippageBps);
      const delta = (currentOffsetted * slip) / BigInt(10000);
      const targetOffsetted = zeroForOne ? currentOffsetted - delta : currentOffsetted + delta;
      const limit = targetOffsetted - (1n << 63n) + BigInt(logOffset) * (1n << 59n);

      const deadline = 2 ** 32 - 1;
      const zfo = 2n;

      const data = swapSequence(
        deployed.nofeeswap,
        deployed.token0,
        deployed.token1,
        address,
        poolIdBn,
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
        const ok = `Confirmed in block ${rec.blockNumber}: ${tx.hash}`;
        setStatus(ok);
      } else {
        setTxPhase("reverted");
        const er = `Reverted: ${tx.hash}`;
        setStatus(er);
      }
    } catch (e: unknown) {
      setTxPhase("reverted");
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg);
    }
  }, [deployed, pool, address, amountIn, slippageBps, zeroForOne, poolIdBn, isCorrectChain, setStatus, setTxPhase]);

  const poolIdShort = shortAddr(pool.poolId, 10, 8);

  return (
    <div className="card card--stagger">
      <div className="card__head">
        <div className="card__title-row">
          <h2 className="card__title">Swap</h2>
          <InfoTip text={HINT.executeSwap} />
        </div>
        <span
          className="chain-pill"
          style={{ background: "rgba(34,211,238,0.1)", color: "var(--accent)" }}
          title={HINT.poolBadge}
        >
          Pool {poolIdShort}
        </span>
      </div>

      <div className="quote-panel">
        <div className="quote-panel__title">Pre-trade estimate</div>
        {estimate ? (
          <ul className="quote-list">
            <li>
              <span>Est. output (spot)</span>
              <code>{estimate.estimatedOutWei.toString().slice(0, 28)}… wei</code>
            </li>
            <li>
              <span>Spot price (token1/token0)</span>
              <code>{estimate.spotPrice01.toExponential(4)}</code>
            </li>
            <li>
              <span>Slippage vs mid (curve)</span>
              <code>~{estimate.impliedPriceImpactBps} bps</code>
            </li>
          </ul>
        ) : (
          <p className="muted-p">Enter a valid amount to see estimates.</p>
        )}
        <p className="quote-disclaimer">{HINT.estimate}</p>
      </div>

      <div className="field">
        <div className="label-row">
          <span className="label">Direction</span>
          <InfoTip text={HINT.directionField} />
        </div>
        <div className="direction-toggle">
          <button
            type="button"
            className={zeroForOne ? "is-active" : ""}
            title={HINT.dirZeroForOne}
            onClick={() => setZeroForOne(true)}
          >
            Token 0 → Token 1
          </button>
          <span title="Direction">
            <svg className="direction-toggle__arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <button
            type="button"
            className={!zeroForOne ? "is-active" : ""}
            title={HINT.dirOneForZero}
            onClick={() => setZeroForOne(false)}
          >
            Token 1 → Token 0
          </button>
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <label className="label" htmlFor="amount">
            Amount (wei)
          </label>
          <InfoTip text={HINT.amountWei} />
        </div>
        <div className="input-wrap">
          <input
            id="amount"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            autoComplete="off"
            title={HINT.amountWei}
          />
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <label className="label" htmlFor="slip">
            Slippage (basis points)
          </label>
          <InfoTip text={HINT.slippageBps} />
        </div>
        <div className="input-wrap">
          <input
            id="slip"
            value={slippageBps}
            onChange={(e) => setSlippageBps(e.target.value)}
            autoComplete="off"
            title={HINT.slippageBps}
          />
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary"
        disabled={!isConnected || !isCorrectChain || txPhase === "pending"}
        title={!isConnected || !isCorrectChain || txPhase === "pending" ? HINT.executeSwapDisabled : HINT.executeSwap}
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
    </div>
  );
}

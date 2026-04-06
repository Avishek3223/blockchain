"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { mintSequence, burnSequence } from "@/lib/nofeeSequences";
import { LOG_PRICE_TICK_X59 } from "@/lib/poolInitHelpers";
import { tagShares } from "@/lib/nofeePool";
import type { DeployedAddresses, LiquidityPosition, PoolJson } from "@/lib/types";

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

export function LiquiditySection({
  deployed,
  pool,
  address,
  isConnected,
  isCorrectChain,
  position,
  onSavePosition,
  onClearPosition,
  onStatus,
}: {
  deployed: DeployedAddresses;
  pool: PoolJson;
  address: string | undefined;
  isConnected: boolean;
  isCorrectChain: boolean;
  position: LiquidityPosition | null;
  onSavePosition: (poolId: string, p: LiquidityPosition) => void;
  onClearPosition: (poolId: string) => void;
  onStatus: (s: string, phase: "idle" | "pending" | "confirmed" | "reverted") => void;
}) {
  const poolIdBn = useMemo(() => BigInt(pool.poolId), [pool.poolId]);
  const [tickLower, setTickLower] = useState(pool.tickLower ?? "-10000");
  const [tickUpper, setTickUpper] = useState(pool.tickUpper ?? "0");
  const [sharesMint, setSharesMint] = useState(pool.sharesMinted ?? "1000000000000000000000000");
  const [sharesBurn, setSharesBurn] = useState("100000000000000000000000");

  const qBounds = useMemo(() => {
    const tl = BigInt(tickLower);
    const tu = BigInt(tickUpper);
    const qMin = LOG_PRICE_TICK_X59 * tl;
    const qMax = LOG_PRICE_TICK_X59 * tu;
    const ts = tagShares(poolIdBn, qMin, qMax);
    return { qMin, qMax, tagShares: ts };
  }, [tickLower, tickUpper, poolIdBn]);

  const runMint = useCallback(async () => {
    if (!address || !isConnected || !isCorrectChain) return;
    const eth = (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) as
      | ethers.Eip1193Provider
      | undefined;
    if (!eth) return;
    onStatus("Minting liquidity…", "pending");
    try {
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const op = deployed.operator;
      const shares = BigInt(sharesMint.trim());
      const deadline = 2 ** 32 - 1;
      const data = mintSequence(
        deployed.nofeeswap,
        deployed.token0,
        deployed.token1,
        qBounds.tagShares,
        poolIdBn,
        qBounds.qMin,
        qBounds.qMax,
        shares,
        "0x",
        deadline,
      );
      const t0 = new Contract(deployed.token0, ERC20_ABI, signer);
      const t1 = new Contract(deployed.token1, ERC20_ABI, signer);
      const max = ethers.MaxUint256;
      if ((await t0.allowance(address, op)) < max / 2n) await (await t0.approve(op, max)).wait();
      if ((await t1.allowance(address, op)) < max / 2n) await (await t1.approve(op, max)).wait();
      const ns = new Contract(deployed.nofeeswap, NOFEESWAP_ABI, signer);
      const tx = await ns.unlock(op, data);
      const rec = await tx.wait();
      if (rec?.status !== 1) {
        onStatus("Mint reverted.", "reverted");
        return;
      }
      const sameRange =
        position &&
        position.poolId === pool.poolId &&
        position.qMin === qBounds.qMin.toString() &&
        position.qMax === qBounds.qMax.toString() &&
        position.tagShares === qBounds.tagShares.toString();
      const prev = sameRange ? BigInt(position!.shares) : 0n;
      const next: LiquidityPosition = {
        poolId: pool.poolId,
        qMin: qBounds.qMin.toString(),
        qMax: qBounds.qMax.toString(),
        tagShares: qBounds.tagShares.toString(),
        shares: (prev + shares).toString(),
      };
      onSavePosition(pool.poolId, next);
      onStatus(`Mint confirmed (block ${rec.blockNumber}).`, "confirmed");
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e), "reverted");
    }
  }, [
    address,
    deployed,
    isConnected,
    isCorrectChain,
    pool.poolId,
    position?.shares,
    qBounds,
    sharesMint,
    onSavePosition,
    onStatus,
  ]);

  const runBurn = useCallback(async () => {
    if (!address || !isConnected || !isCorrectChain) return;
    if (!position || position.poolId !== pool.poolId) {
      onStatus("No matching position for this pool — mint first.", "idle");
      return;
    }
    const eth = (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) as
      | ethers.Eip1193Provider
      | undefined;
    if (!eth) return;
    if (BigInt(sharesBurn.trim()) > BigInt(position.shares)) {
      onStatus("Burn amount exceeds tracked position.", "idle");
      return;
    }
    onStatus("Burning liquidity…", "pending");
    try {
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const op = deployed.operator;
      const shares = BigInt(sharesBurn.trim());
      const deadline = 2 ** 32 - 1;
      const qMin = BigInt(position.qMin);
      const qMax = BigInt(position.qMax);
      const ts = BigInt(position.tagShares);
      const data = burnSequence(
        deployed.token0,
        deployed.token1,
        address,
        ts,
        poolIdBn,
        qMin,
        qMax,
        shares,
        "0x",
        deadline,
      );
      const ns = new Contract(deployed.nofeeswap, NOFEESWAP_ABI, signer);
      const tx = await ns.unlock(op, data);
      const rec = await tx.wait();
      if (rec?.status !== 1) {
        onStatus("Burn reverted.", "reverted");
        return;
      }
      const prev = BigInt(position.shares);
      const left = prev - shares;
      if (left <= 0n) {
        onClearPosition(pool.poolId);
        onStatus("Full withdrawal confirmed.", "confirmed");
      } else {
        onSavePosition(pool.poolId, { ...position, shares: left.toString() });
        onStatus(`Partial burn confirmed. Remaining shares ${left.toString().slice(0, 12)}…`, "confirmed");
      }
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e), "reverted");
    }
  }, [
    address,
    deployed,
    isConnected,
    isCorrectChain,
    pool.poolId,
    position,
    poolIdBn,
    sharesBurn,
    onSavePosition,
    onClearPosition,
    onStatus,
  ]);

  return (
    <div className="card card--stagger">
      <div className="card__head">
        <div className="card__title-row">
          <h2 className="card__title">Liquidity</h2>
          <InfoTip text="Mint adds concentrated liquidity via operator unlock + MODIFY_POSITION; burn removes shares in the same tick range. Position is tracked locally for this demo (no on-chain share balance reader)." />
        </div>
      </div>

      <div className="lp-summary">
        <div>
          <span className="muted-label">tagShares</span>
          <code className="mono-val">{position ? short(position.tagShares) : short(qBounds.tagShares.toString())}</code>
        </div>
        <div>
          <span className="muted-label">Tracked shares</span>
          <code className="mono-val">{position ? position.shares.slice(0, 22) + "…" : "—"}</code>
        </div>
      </div>

      <div className="field field--grid2">
        <div>
          <label className="label" htmlFor="tl">
            Tick lower
          </label>
          <div className="input-wrap">
            <input id="tl" value={tickLower} onChange={(e) => setTickLower(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tu">
            Tick upper
          </label>
          <div className="input-wrap">
            <input id="tu" value={tickUpper} onChange={(e) => setTickUpper(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <label className="label" htmlFor="sm">
            Shares to mint (wei)
          </label>
          <InfoTip text="Larger values need sufficient token balances and approvals." />
        </div>
        <div className="input-wrap">
          <input id="sm" value={sharesMint} onChange={(e) => setSharesMint(e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        className="btn btn--secondary"
        disabled={!isConnected || !isCorrectChain}
        onClick={runMint}
      >
        Mint liquidity
      </button>

      <div className="field" style={{ marginTop: "1rem" }}>
        <div className="label-row">
          <label className="label" htmlFor="sb">
            Shares to burn (wei)
          </label>
        </div>
        <div className="input-wrap">
          <input id="sb" value={sharesBurn} onChange={(e) => setSharesBurn(e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        className="btn btn--ghost-wide"
        disabled={!isConnected || !isCorrectChain || !position}
        onClick={runBurn}
      >
        Burn (partial or full)
      </button>
    </div>
  );
}

function short(s: string, left = 12) {
  if (s.length <= left + 4) return s;
  return `${s.slice(0, left)}…`;
}

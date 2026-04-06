"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PoolInitSection } from "@/components/PoolInitSection";
import { LiquiditySection } from "@/components/LiquiditySection";
import { SwapSection } from "@/components/SwapSection";
import { useActivePool } from "@/hooks/useActivePool";
import { useLiquidityPosition } from "@/hooks/useLiquidityPosition";
import type { DeployedAddresses, PoolJson } from "@/lib/types";

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

function IconBlocks() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8zm8-2.2L6.7 8 12 10.4 17.3 8 12 5.8zM6 10.7v4.6l6 3v-4.6l-6-3zm12 0l-6 3v4.6l6-3v-4.6z" />
    </svg>
  );
}

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
  connectWallet:
    "Opens your browser wallet (e.g. MetaMask). After connecting, use chain Localhost 31337 (http://127.0.0.1:8545).",
  disconnectWallet: "Disconnects the active wallet from this site.",
  chainOk: "You are on the local Hardhat network (chain ID 31337).",
  chainWrong: "Switch MetaMask to Localhost 31337 (RPC http://127.0.0.1:8545).",
  walletSection: "Connect MetaMask to sign pool init, liquidity, and swaps.",
} as const;

function shortAddr(a: string, left = 6, right = 4) {
  if (a.length <= left + right) return a;
  return `${a.slice(0, left)}…${a.slice(-right)}`;
}

export default function Page() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [deployed, setDeployed] = useState<DeployedAddresses | null>(null);
  const [fetchedPool, setFetchedPool] = useState<PoolJson | null>(null);
  const [loadErr, setLoadErr] = useState<string>("");
  const [status, setStatus] = useState("");
  const [txPhase, setTxPhase] = useState<"idle" | "pending" | "confirmed" | "reverted">("idle");

  const { pool, savePool, resetToDeployed, hydrated } = useActivePool(fetchedPool);
  const { position, savePosition, clearPosition } = useLiquidityPosition(pool?.poolId);

  const isCorrectChain = chain?.id === 31337;

  const deployedFull = useMemo(() => {
    if (!deployed) return null;
    if (!deployed.delegatee || !deployed.poolGrowthPortion) return null;
    return deployed;
  }, [deployed]);

  const handleGlobalStatus = useCallback(
    (s: string, phase: "idle" | "pending" | "confirmed" | "reverted") => {
      setStatus(s);
      setTxPhase(phase);
    },
    [],
  );

  const onPoolCreated = useCallback(
    (p: PoolJson) => {
      savePool(p);
      setTxPhase("confirmed");
    },
    [savePool],
  );

  useEffect(() => {
    fetch("/deployed/addresses.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        setDeployed(j as DeployedAddresses);
        setLoadErr("");
      })
      .catch(() =>
        setLoadErr("Could not load /deployed/addresses.json — deploy and npm run copy-deployed from repo root."),
      );
    fetch("/deployed/pool.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setFetchedPool(j as PoolJson);
      })
      .catch(() => {});
  }, []);

  const statusClass = useMemo(() => {
    if (txPhase === "pending") return "status-panel--pending";
    if (txPhase === "confirmed") return "status-panel--ok";
    if (txPhase === "reverted") return "status-panel--err";
    return "";
  }, [txPhase]);

  return (
    <>
      <div className="app-bg" aria-hidden>
        <div className="app-bg__grid" />
        <div className="app-bg__orb app-bg__orb--a" />
        <div className="app-bg__orb app-bg__orb--b" />
        <div className="app-bg__scan" />
      </div>

      <main className="app-shell app-shell--dashboard">
        <header className="hero hero--bounded">
          <div
            className="hero__badge"
            title="Local Hardhat + NoFeeSwap operator unlock path: initialize pool, mint/burn liquidity, swap."
          >
            <IconBlocks />
            Local chain · Full assignment UI
          </div>
          <h1 className="hero__title">NoFeeSwap</h1>
          <p className="hero__sub">
            Initialize a pool, manage liquidity, and swap — with spot estimates and a kernel preview. Requires{" "}
            <code className="inline-code">deployed/*.json</code> in <code className="inline-code">public/deployed</code>.
          </p>
        </header>

        <div className="dashboard-top">
          <div className="card card--stagger card--wallet-bar">
            <div className="card__head card__head--wallet">
              <div className="card__title-row">
                <h2 className="card__title">Wallet</h2>
                <InfoTip text={HINT.walletSection} />
              </div>
              {isConnected && (
                <span
                  className={isCorrectChain ? "chain-pill" : "chain-pill chain-pill--warn"}
                  title={isCorrectChain ? HINT.chainOk : HINT.chainWrong}
                >
                  {isCorrectChain ? `Chain ${chain?.id}` : `Wrong chain (${chain?.id ?? "?"})`}
                </span>
              )}
            </div>
            {!isConnected ? (
              <button
                type="button"
                className="btn btn--connect btn--wallet-action"
                title={HINT.connectWallet}
                onClick={() => connect({ connector: connectors[0] })}
              >
                <IconWallet />
                Connect wallet
              </button>
            ) : (
              <div className="wallet-row wallet-row--bar">
                <span className="address-pill" title={address ? `Full address: ${address}` : undefined}>
                  {address ? shortAddr(address) : ""}
                </span>
                <button type="button" className="btn btn--ghost" title={HINT.disconnectWallet} onClick={() => disconnect()}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {loadErr && (
            <div className="card card--stagger card--alert-inline">
              <p className="status-panel status-panel--err">{loadErr}</p>
            </div>
          )}

          {hydrated && deployedFull && pool && (
            <p className="pool-revert pool-revert--bar">
              <button type="button" className="link-btn" onClick={resetToDeployed}>
                Reset pool to deployed/pool.json
              </button>{" "}
              <span className="pool-revert__hint">(clears local override)</span>
            </p>
          )}
        </div>

        {deployedFull && (
          <div className="dashboard-grid">
            <div className="dashboard-col">
              <PoolInitSection
                deployed={deployedFull}
                address={address}
                isConnected={isConnected}
                isCorrectChain={isCorrectChain}
                onPoolCreated={onPoolCreated}
                onStatus={handleGlobalStatus}
              />
            </div>

            <div className="dashboard-col dashboard-col--trade">
              {hydrated && pool && (
                <>
                  <LiquiditySection
                    deployed={deployedFull}
                    pool={pool}
                    address={address}
                    isConnected={isConnected}
                    isCorrectChain={isCorrectChain}
                    position={position}
                    onSavePosition={savePosition}
                    onClearPosition={clearPosition}
                    onStatus={handleGlobalStatus}
                  />

                  <SwapSection
                    deployed={deployedFull}
                    pool={pool}
                    address={address}
                    isConnected={isConnected}
                    isCorrectChain={isCorrectChain}
                    setStatus={setStatus}
                    txPhase={txPhase}
                    setTxPhase={setTxPhase}
                  />
                </>
              )}

              {hydrated && !pool && (
                <div className="card card--stagger card--hint-tall">
                  <p className="muted-p">
                    No <code className="inline-code">pool.json</code> yet. Run <code className="inline-code">initPool.ts</code>{" "}
                    and <code className="inline-code">npm run copy-deployed</code>, refresh, or initialize a pool in the left
                    column (set a unique <strong>pool nonce</strong> per pool).
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {status && (
          <div className={`status-panel global-status ${statusClass}`}>
            <div className="status-panel__row">
              {txPhase === "pending" && <span className="status-dot" />}
              <span>{status}</span>
            </div>
          </div>
        )}

        <p className="footer-hint">
          <span>◆</span> NoFeeSwap assignment — estimates are spot-based, not an on-chain quoter
        </p>
      </main>
    </>
  );
}

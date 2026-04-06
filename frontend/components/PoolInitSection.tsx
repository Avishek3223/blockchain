"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowserProvider, Contract, Interface, ethers } from "ethers";
import { KernelChart } from "./KernelChart";
import { LOG_PRICE_SPACING_LARGE_X59, prepareInitializeArgs } from "@/lib/poolInitHelpers";
import type { DeployedAddresses, PoolJson } from "@/lib/types";

const DELEGATEE_ABI = [
  "function initialize(uint256 unsaltedPoolId, uint256 tag0, uint256 tag1, uint256 poolGrowthPortion, uint256[] kernelCompactArray, uint256[] curveArray, bytes hookData)",
];

const NOFEESWAP_DISPATCH_ABI = [
  "function dispatch(bytes calldata input) external returns (int256 output0, int256 output1)",
];

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" data-tooltip={text} tabIndex={0} role="img" aria-label={text}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a1 1 0 110 2 1 1 0 010-2zm-1 4h2v5H7V7z" />
      </svg>
    </span>
  );
}

export function PoolInitSection({
  deployed,
  address,
  isConnected,
  isCorrectChain,
  onPoolCreated,
  onStatus,
}: {
  deployed: DeployedAddresses;
  address: string | undefined;
  isConnected: boolean;
  isCorrectChain: boolean;
  onPoolCreated: (p: PoolJson) => void;
  onStatus: (s: string, phase: "idle" | "pending" | "confirmed" | "reverted") => void;
}) {
  const [sqrtPriceX96, setSqrtPriceX96] = useState("67254909186229727392878661970");
  const [logOffset, setLogOffset] = useState("0");
  const [poolNonce, setPoolNonce] = useState("0");
  const [kernelB, setKernelB] = useState(LOG_PRICE_SPACING_LARGE_X59.toString());
  const [kernelC, setKernelC] = useState(String(2 ** 15));

  const kernelPreview = useMemo(() => {
    const b = Number(kernelB) || 0;
    const c = Number(kernelC) || 0;
    return [
      { bx: 0, cy: 0 },
      { bx: b / 1e12, cy: c }, // scale X for display only
    ];
  }, [kernelB, kernelC]);

  const runInit = useCallback(async () => {
    if (!address || !isConnected || !isCorrectChain) {
      onStatus("Connect wallet on chain 31337 first.", "idle");
      return;
    }
    const eth = (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) as
      | ethers.Eip1193Provider
      | undefined;
    if (!eth) {
      onStatus("No injected wallet.", "idle");
      return;
    }
    onStatus("Submit pool initialization…", "pending");
    try {
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const sqrt = BigInt(sqrtPriceX96.trim());
      const lo = Number.parseInt(logOffset, 10);
      const nonce = Number.parseInt(poolNonce, 10);
      if (Number.isNaN(lo) || lo < -128 || lo > 127) {
        onStatus("log offset must be int8 (-128…127).", "reverted");
        return;
      }
      if (Number.isNaN(nonce) || nonce < 0 || nonce > 0xfffff) {
        onStatus("pool nonce must be 0…1048575 (unique per owner).", "reverted");
        return;
      }
      const spacing = LOG_PRICE_SPACING_LARGE_X59;
      const kb = BigInt(kernelB.trim());
      const kc = BigInt(kernelC.trim());

      const prep = prepareInitializeArgs({
        ownerAddress: address,
        token0: deployed.token0,
        token1: deployed.token1,
        poolGrowthPortion: BigInt(deployed.poolGrowthPortion),
        sqrtPriceX96: sqrt,
        logOffset: lo,
        poolFlagBits: nonce,
        kernelSecondB: kb,
        kernelSecondC: kc,
        spacing,
      });

      const delIface = new Interface(DELEGATEE_ABI);
      const initData = delIface.encodeFunctionData("initialize", [
        prep.unsaltedPoolId,
        prep.tag0,
        prep.tag1,
        BigInt(deployed.poolGrowthPortion),
        prep.kernelCompact,
        prep.curveEncoded,
        "0x",
      ]);

      const ns = new Contract(deployed.nofeeswap, NOFEESWAP_DISPATCH_ABI, signer);
      const tx = await ns.dispatch(initData);
      onStatus(`Pending: ${tx.hash}`, "pending");
      const rec = await tx.wait();
      if (rec?.status !== 1) {
        onStatus("Initialize reverted.", "reverted");
        return;
      }

      const poolJson: PoolJson = {
        poolId: prep.poolId.toString(),
        unsaltedPoolId: prep.unsaltedPoolId.toString(),
        token0: deployed.token0,
        token1: deployed.token1,
        curve: prep.curve.map((c) => c.toString()),
        kernel: [
          ["0", "0"],
          [kb.toString(), kc.toString()],
        ],
      };
      onPoolCreated(poolJson);
      onStatus(`Pool initialized. poolId ${poolJson.poolId.slice(0, 18)}…`, "confirmed");
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e), "reverted");
    }
  }, [
    address,
    deployed,
    isConnected,
    isCorrectChain,
    sqrtPriceX96,
    logOffset,
    poolNonce,
    kernelB,
    kernelC,
    onPoolCreated,
    onStatus,
  ]);

  return (
    <div className="card card--stagger">
      <div className="card__head">
        <div className="card__title-row">
          <h2 className="card__title">Initialize pool</h2>
          <InfoTip text="Creates a new pool via Nofeeswap.dispatch(initialize(...)). You pay gas; poolId is derived from your address and the unsalted id (nonce). Uses the same curve/kernel encoding as scripts/initPool.ts." />
        </div>
      </div>

      <p className="muted-p">
        Enter parameters below or rely on <code className="inline-code">scripts/initPool.ts</code> defaults. Increase{" "}
        <strong>pool nonce</strong> for each new pool from the same account.
      </p>

      <KernelChart points={kernelPreview} />

      <div className="field">
        <div className="label-row">
          <label className="label" htmlFor="sqrt">
            sqrtPriceX96
          </label>
          <InfoTip text="Initial price as Uniswap-style sqrt(price) in Q64.96. Default matches the bundled init script." />
        </div>
        <div className="input-wrap">
          <input id="sqrt" value={sqrtPriceX96} onChange={(e) => setSqrtPriceX96(e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="field field--grid2">
        <div>
          <div className="label-row">
            <label className="label" htmlFor="logoff">
              Log offset (int8)
            </label>
          </div>
          <div className="input-wrap">
            <input id="logoff" value={logOffset} onChange={(e) => setLogOffset(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="label-row">
            <label className="label" htmlFor="pn">
              Pool nonce
            </label>
            <InfoTip text="20-bit flag field for uniqueness (0…1048575). Required when creating another pool from the same address." />
          </div>
          <div className="input-wrap">
            <input id="pn" value={poolNonce} onChange={(e) => setPoolNonce(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="field field--grid2">
        <div>
          <div className="label-row">
            <label className="label" htmlFor="kb">
              Kernel b₂ (X59)
            </label>
          </div>
          <div className="input-wrap">
            <input id="kb" value={kernelB} onChange={(e) => setKernelB(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="label-row">
            <label className="label" htmlFor="kc">
              Kernel c₂ (X15)
            </label>
          </div>
          <div className="input-wrap">
            <input id="kc" value={kernelC} onChange={(e) => setKernelC(e.target.value)} />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn--secondary"
        disabled={!isConnected || !isCorrectChain}
        onClick={runInit}
      >
        Initialize pool on-chain
      </button>
    </div>
  );
}

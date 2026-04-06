# NoFeeSwap — Local Assignment (Deploy, dApp, Sandwich Bot)

This repository implements the technical assignment: **Hardhat** local node, **NoFeeSwap core + operator** deployment (CREATE3, matching upstream tests), **mock ERC-20s**, a **Next.js + wagmi** dApp for swaps, and a **sandwich bot** that listens for pending `unlock` txs and submits frontrun/backrun transactions with ordered gas prices.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **MetaMask** (or any injected EIP-1193 wallet)
- **Git** (already used to vendor `nofeeswap-core` / `nofeeswap-operator` — see folders in repo)

Optional (assignment prefers Anvil; this submission uses **Hardhat node** throughout, which is explicitly allowed):

- [Foundry](https://book.getfoundry.sh/) (`anvil`, `forge`) if you want to mirror scripts against Anvil instead.

## One-time: compile contracts

From the repo root (`f:\web3`):

```bash
npm install
npx hardhat compile
```

Submodule note: `nofeeswap-operator/lib/core` submodules were initialized shallow so Hardhat can resolve imports.

## 1) Start local chain

Terminal A:

```bash
npx hardhat node
```

Default chain id **31337**, RPC **http://127.0.0.1:8545**, WebSocket **ws://127.0.0.1:8545**.

## 2) Deploy contracts

Terminal B:

```bash
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/initPool.ts --network localhost
```

This writes:

- `deployed/addresses.json` — singleton, operator, tokens, etc.
- `deployed/pool.json` — initialized pool id, curve, ticks used for the scripted mint.

Copy deployment artifacts for the UI:

```bash
# PowerShell
Copy-Item deployed\*.json frontend\public\deployed\
```

## 3) Start the dApp

```bash
cd frontend
npm install
npm run dev
```

From the repo root you can instead run: `npm run dev:ui` (after `npm install` inside `frontend` once).

Open **http://localhost:3000**. In MetaMask:

1. Import a test account (e.g. Hardhat #0 private key from `npx hardhat node` output).
2. Add network: **RPC** `http://127.0.0.1:8545`, **chain id** `31337`.
3. Connect the site and use **Swap** (approves operator, then `unlock(operator, swapSequence)`).

## 4) Sandwich bot (mempool-style demo)

With the node running:

```bash
npx hardhat run scripts/sandwichBot.ts --network localhost
```

The script:

1. Calls **`evm_setAutomine`** with `false` so transactions are not mined immediately.
2. Subscribes to **`pending`** over WebSocket.
3. Decodes **`unlock(address,bytes)`** calldata, extracts a rough **`amountSpecified`** from the encoded `swapSequence` bytes (deadline + `PUSH32` path).
4. Submits **frontrun** (`gasPrice` +30%) and **backrun** (`gasPrice` victim−1) swaps via the same `unlock` entrypoint.

Then submit a swap from the dApp. You may need to **`evm_mine`** manually in another console for demonstration, depending on how the client batches transactions.

```bash
npx hardhat console --network localhost
# await network.provider.send("evm_mine", [])
```

## Architecture (bot)

- **Detection:** `ws.on("pending", hash)` → `getTransaction` → filter `to === Nofeeswap`, selector `unlock(address,bytes)`.
- **Decode:** ABI-decode outer calldata; parse inner `bytes` for `amountSpecified` at a fixed offset consistent with `swapSequence` (deadline `uint32`, then `PUSH32`).
- **Profitability:** Not modeled as a production MEV engine — the bot demonstrates **ordering** and **gas bids** only (per assignment scope).

## Transparency (required)

| Area | Status |
|------|--------|
| Local node (Hardhat) | **Complete** |
| Core + operator deploy (CREATE3, modifyProtocol, setOperator) | **Complete** |
| Mock ERC-20 + mint to deployer | **Complete** |
| Pool initialize + scripted mint (`initPool.ts`) | **Complete** |
| dApp: wallet connect + tx pending/confirmed/reverted | **Complete** (global status line + section actions) |
| dApp: pool initialization UI | **Complete** — `dispatch(initialize(...))` via delegatee ABI; **kernel preview** chart + editable kernel/curve parameters (same encoding as `initPool.ts`). Unique **pool nonce** per pool from the same account. |
| dApp: liquidity mint/burn UI | **Complete** — mint/burn via `unlock` + sequences; **position** (shares, range, tagShares) tracked in **localStorage** (demo — not an on-chain share index). |
| dApp: swap + slippage control | **Complete** — same path as before; slippage adjusts log limit. |
| dApp: estimated output / price impact | **Complete (spot model)** — **not** an on-chain quoter: estimates from **curve mid-price** + implied slippage vs mid from your limit; clearly labeled in UI. |
| Bot: mempool monitoring | **Complete** (WebSocket `pending` on Hardhat) |
| Bot: calldata decode for victim size / slippage | **Complete (practical)** — `amountSpecified` + **limitOffsetted** parse + **~bps** vs mid logged |
| Bot: sandwich gas ordering | **Complete** (EOA txs, gas price ladder) |
| Anvil-specific scripts | **Omitted** — README documents equivalence; install Foundry to swap tooling |

## Known limitations

- **LP position display** is **browser-local** (localStorage), not read from chain state.
- **Swap estimates** use a **spot approximation** from the packed curve; for production you would add a quoter or `eth_call` simulation strategy.
- **Kernel UI** is a **compact preview** (two-segment default editable); advanced multi-breakpoint editing matches script-level data, not a full YellowPaper authoring tool.
- **JavaScript `%` vs Python `%`:** curve lower bound must use **Python-style** non-negative modulus (`pyMod` in `initPool.ts`) or initialization reverts.
- **Sandwich on Hardhat:** ordering in a real mempool is simplified; you may need **`evm_mine`** to close blocks for demos.
- **Security:** test keys and localhost only — never reuse on mainnet.

## Repository layout

See **`STRUCTURE.md`** for a full map. In short:

- **`frontend/`** — Next.js + wagmi UI (`npm run dev:ui` from repo root, or `cd frontend && npm run dev`).
- **`scripts/`**, **`contracts/`**, **`hardhat.config.ts`** — Hardhat deploy, init pool, sandwich bot, encoding helpers.
- **`nofeeswap-core/`**, **`nofeeswap-operator/`** — upstream protocol sources.
- **`deployed/`** — JSON from scripts; **`npm run copy-deployed`** copies into `frontend/public/deployed/`.

## Video walkthrough checklist

1. Show `npx hardhat node` + deploy + `initPool` + `npm run copy-deployed`.
2. `npm run dev` in `frontend` (or `npm run dev:ui` from root), connect MetaMask — optionally **initialize another pool** in the UI (change pool nonce), **mint/burn** liquidity, then **swap** with estimates visible.
3. Run sandwich bot with automine off, submit swap from the UI, show bot logs (amount + implied slippage bps) and mined ordering / `evm_mine` if needed.

## License / upstream

NoFeeSwap core and operator sources retain their upstream licenses. This assignment layer is provided as-is for evaluation.

# Repository layout

This repo is split into **chain / backend tooling** (Hardhat, scripts, bots) and **frontend** (Next.js). Everything below is relative to the repo root.

## Frontend (Web UI)

| Path | Role |
|------|------|
| **`frontend/`** | Next.js 15 app: `app/`, `components/`, `hooks/`, `lib/`, `public/deployed/*.json` |
| **`frontend/public/deployed/`** | Copy of `deployed/` after deploy — run `npm run copy-deployed` from the **repo root** |

## Chain & automation (not a separate server process)

| Path | Role |
|------|------|
| **`hardhat.config.ts`**, **`contracts/`** | Hardhat project root |
| **`scripts/`** | `deploy.ts`, `initPool.ts`, `sandwichBot.ts`, shared `lib/nofee*.ts` |
| **`deployed/`** | JSON written by scripts — source of truth before `copy-deployed` |
| **`test/`**, **`ignition/`** | Tests / deployment modules (if used) |

## Upstream protocol sources (vendored)

| Path | Role |
|------|------|
| **`nofeeswap-core/`** | NoFeeSwap core contracts |
| **`nofeeswap-operator/`** | Operator + helpers |

## Build artifacts (gitignored)

| Path | Role |
|------|------|
| **`artifacts/`**, **`cache/`** | Hardhat compile output |
| **`frontend/node_modules/`**, **`frontend/.next/`** | Next.js / npm |

## Typical commands

- **Chain:** from repo root — `npx hardhat compile`, `npx hardhat node`, `npm run deploy`, `npm run init-pool`, `npm run bot`
- **Copy JSON to UI:** `npm run copy-deployed`
- **UI:** `npm run dev:ui` or `cd frontend && npm run dev`

The old **`dapp/`** folder name is **deprecated**; use **`frontend/`** only.

If you still see a **`dapp/`** directory locally (often only `.next/` + `node_modules/`), it is safe to delete after **stopping** `npm run dev` and any process locking files under `dapp` (Windows may lock `*.node` binaries until processes exit). It is listed in `.gitignore` so it will not be committed again.

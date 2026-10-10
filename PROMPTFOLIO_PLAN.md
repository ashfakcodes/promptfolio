# Promptfolio — Foolproof Project Blueprint & Implementation Plan
> **BNB Hack: Tokenized Stocks Edition** | Track: *Tokenized Stocks Products & Agents*

---

## 1. Executive Summary & Core Value Proposition

**Promptfolio** is an autonomous, natural-language on-chain ETF synthesizer designed for the BNB Chain ecosystem. 

* **The Problem:** Traditional ETFs require months of regulatory filings, custodial gatekeepers, and closed market hours (shut Friday 4 PM to Monday 9:30 AM). On-chain equities trade 24/7 on BNB Smart Chain (BSC), but lack unified portfolio tooling.
* **The Solution:** A user types any conversational investment thesis (e.g., *"Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield"*). Promptfolio automatically decomposes the prompt, validates against available **bStocks** on BSC, calculates risk-weighted allocations, simulates optimal swap routes via the Binance Web3 API suite, and executes the entire spot basket in a **single atomic transaction** on BSC.

---

## 2. Confirmed Project Architecture & Rules

1. **Frontend Architecture:**
   * Pure **Vanilla HTML5 / CSS3 / JavaScript (ES6)**.
   * **Design System Strict Adherence:** Must preserve and strictly expand upon `frontend/landing.html` and `frontend/src/styles.css` (Space Mono & Google Sans typography, hand-drawn SVG background flow diagrams, high-contrast dark execution cards, and Chart.js).
2. **Backend Architecture:**
   * **Node.js (Express / ESM)** micro-service orchestrating LLM intent parsing, Binance Web3 API integrations, and mathematical quant normalization.
3. **Asset Scope (RWA):**
   * Exclusively centered on **bStocks** (Binance Tokenized Equities on BSC, e.g., `bNVDA`, `bAAPL`, `bTSLA`, `bMSFT`, `bAMZN`, `bGOOGL`) paired with `USDT` / `BNB` base liquidity.
4. **Dual-Network Support:**
   * Seamless configuration toggle between **BSC Testnet (Chain ID 97)** for risk-free testing and **BSC Mainnet (Chain ID 56)** for the final live demo submission.
5. **Hackathon Compliance:**
   * Spot only (no perpetuals).
   * BSC Mainnet verified execution with small real amounts ($5–$10).
   * Mandatory **Developer Experience Report** (25% of hackathon score).
6. **LLM Provider & Model:**
   * **OpenRouter API** (`https://openrouter.ai/api/v1`) via standard OpenAI client.
   * Target Model: `OPENROUTER_MODEL=inclusionai/ling-3.0-flash`.
   * Intelligent offline/mock fallback if `OPENROUTER_API_KEY` is not set.

---

## 3. End-to-End Pipeline & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. USER INTERACTION                             │
│  User inputs natural-language prompt into Prompt Bar                   │
│  Network Switcher: [ BSC Testnet (97) | BSC Mainnet (56) ]             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        2. INTENT PARSER                                │
│  - LLM Structured JSON Schema                                          │
│  - Extracts target bStocks tickers, investment thesis & target weights │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    3. LIVE bSTOCKS DATA FETCHER                        │
│  - Binance Web3 RWA Data API (`/api/v1/rwa/...`)                       │
│  - Validates active BSC contracts (bNVDA, bAAPL, etc.)                 │
│  - Fetches live BSC spot prices and Friday TradFi close reference      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     4. ALLOCATION & QUANT ENGINE                       │
│  - Weight Normalizer (guarantees exact 100.0% sum)                     │
│  - Computes composite yield, risk score, and 24/7 off-hours spread     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    5. ROUTE & SIMULATION ENGINE                        │
│  - Binance Web3 Trading API: Queries optimal DEX swap routes (USDT)    │
│  - Binance Web3 Transaction API: Simulates gas and checks slippage     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 6. DYNAMIC FACTSHEET & EXECUTION                       │
│  - Background SVG flow lights up stage-by-stage                        │
│  - Doughnut chart & Execution Overview receipt dynamically render      │
│  - 1-Click Atomic Buy dispatched via connected Web3 wallet             │
│  - Post-trade tracking via Binance Web3 Address Portfolio API          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Official Binance Web3 API Integration Matrix

All endpoints derived from the official [BNB Chain Hackathon Resources](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=resources):

| Module | Exact Endpoint | Purpose in Promptfolio |
| :--- | :--- | :--- |
| **RWA Data** | `GET /api/v1/rwa/token/list` | Fetch active bStocks catalog & verified BSC contract addresses |
| **RWA Data** | `GET /api/v1/rwa/token/price` | Pull live on-chain spot prices for bStocks |
| **RWA Data** | `GET /api/v1/rwa/underlying/market-data` | Retrieve TradFi Friday close to compute 24/7 weekend spreads |
| **RWA Data** | `GET /api/v1/rwa/underlying/info` | Pull corporate metadata and attestation info for factsheet |
| **Trading API** | `GET /api/v1/dex/aggregator/quote` | Fetch optimal swap routes on BSC and obtain 30s `quoteId` |
| **Trading API** | `GET /api/v1/dex/aggregator/swap` | Generate unsigned EVM swap payload (`to`, `data`, `value`) |
| **Trading API** | `GET /api/v1/dex/aggregator/approve-transaction` | Construct conditional ERC-20 approval transaction |
| **Transaction API** | `POST /api/v1/transaction/simulate` | Simulate multi-swap execution to guarantee zero gas waste |
| **Portfolio API** | `GET /api/v1/address/portfolio/overview` | Track post-trade holdings, portfolio PnL, and allocation drift |

---

## 5. Project Directory Structure

```
BNBCHAIN Hackathon/
├── PROMPTFOLIO_PLAN.md                  # This master blueprint
├── README.md                            # Comprehensive project overview
├── frontend/
│   ├── app.html                         # High-performance dApp terminal & Agentic Control Hub
│   ├── landing.html                     # Neo-brutalist interactive landing page
│   ├── src/
│   │   ├── styles.css                   # Custom design system, HUD & neon animations
│   │   ├── script.js                    # Chart.js, Agentic Wallet manager, SVG flow states
│   │   ├── binance_logo_yellow.svg      # Official Binance yellow logo
│   │   ├── binance_logo_white.svg       # Official Binance white logo
│   │   └── binance_logo_black.svg       # Official Binance black logo
│   └── assets/                          # Badges & diagrams
├── backend/
│   ├── package.json                     # Express, @binance/agentic-wallet, OpenAI SDK, Ethers
│   ├── .env.example                     # OPENROUTER_API_KEY, BINANCE_API_KEY, etc.
│   ├── src/
│   │   ├── server.js                    # REST API entry point & Agentic Wallet routes
│   │   ├── config/
│   │   │   ├── network.js               # BSC Testnet (97) / Mainnet (56) config
│   │   │   └── bstocksCatalog.js        # Verified bStocks BSC contract registry
│   │   └── services/
│   │       ├── intentParser.js          # LLM prompt decomposition (OpenRouter / ling-3.0-flash)
│   │       ├── dataFetcher.js           # Binance RWA Data API client (with mock fallback)
│   │       ├── quantEngine.js           # Normalization & metric calculator
│   │       ├── simulationEngine.js      # Trading & Transaction API router
│   │       └── agenticWalletService.js  # Binance Agentic Wallet (baw) & MPC keyless manager
│   └── test/
│       └── api.test.js                  # Automated verification test suite
├── skills/
│   └── promptfolio-etf-synthesizer/
│       └── SKILL.md                     # Official Binance Skills Hub integration specification
├── contracts/
│   └── BasketRouter.sol                 # Atomic multi-swap aggregator contract
└── docs/
    ├── DEV_EXPERIENCE_REPORT.md         # Mandatory 25% Hackathon score document
    └── DEMO_SCRIPT.md                   # 3.5-minute video presentation guide
```

---

## 6. Implementation Phases & Milestones

### Phase 1: Backend Foundation & bStocks Pipeline
- [x] Initialize `backend/` with Node.js (ESM), Express, and CORS.
- [x] Implement `network.js` supporting BSC Testnet (97) and BSC Mainnet (56).
- [x] Build `dataFetcher.js` integrating Binance RWA Data API with a resilient mock fallback feed.
- [x] Build `intentParser.js` producing structured JSON for bStocks portfolios.
- [x] Build `quantEngine.js` for weight normalization, composite yield, and off-hours spread calculations.
- [x] Implement `POST /api/synthesize` endpoint orchestrating the full pipeline.

### Phase 2: Frontend Interactivity & Visual Connection
- [x] Upgrade `frontend/landing.html` and `frontend/app.html` to allow custom text input with quick-prompt chips.
- [x] Add the network toggle pill (`BSC Testnet` / `BSC Mainnet`) in the header.
- [x] Wire `frontend/src/script.js` to call `POST /api/synthesize`.
- [x] Implement sequential illumination of background SVG diagram boxes as each pipeline stage completes.
- [x] Make the Chart.js doughnut chart and Execution Overview receipt update dynamically with live data.

### Phase 3: Binance Wallet Suite & Autonomous Agentic Wallet
- [x] Integrate exclusive Binance Wallet connection (Binance Web3 Wallet / Binance Chain Wallet with strict non-Binance rejection & Demo mode fallback).
- [x] Install and configure official `@binance/agentic-wallet` (v1.10.0) with verified `baw` CLI binary.
- [x] Implement `agenticWalletService.js` managing MPC keyless sessions, guardrail checks, daily quota tracking ($50,000 limit), MEV protection, and x402 AI micro-payment intelligence pre-checks.
- [x] Build live Agentic Guardrail HUD banner (`#agenticHud`) with remaining quota tracker, risk status, and MEV tags.
- [x] Add Agentic Wallet Control Hub Modal (`#agenticWalletModal`) for QR pairing (`baw auth signin`), limit configuration, and autonomous activity logs.
- [x] Connect the `Execute Basket` button with dual-mode dispatch (Autonomous Agentic execution vs. Binance Web3 Wallet extension).
- [x] Standardize all Binance branding to official local SVGs (`binance_logo_yellow.svg`, `binance_logo_black.svg`, `binance_logo_white.svg`).
- [x] Build Binance Skills Hub compatible skill (`skills/promptfolio-etf-synthesizer/SKILL.md`).

### Phase 4: Hackathon Deliverables & Verification
- [x] Complete `docs/DEV_EXPERIENCE_REPORT.md` (worth 25% of total score):
  - Detailed evaluation of RWA Data, DEX Aggregator, Transaction Simulation, Address Portfolio, and `@binance/agentic-wallet` with recommendations.
- [x] Automated backend and Agentic Wallet test suite passing in `backend/test/api.test.js`.
- [ ] Finalize `docs/DEMO_SCRIPT.md` and record the video walkthrough (≤ 4 minutes).
- [ ] Prepare public GitHub repository and deployment link for judges.

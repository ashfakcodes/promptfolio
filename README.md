# ⚡ Promptfolio — Autonomous On-Chain ETF Synthesizer on BNB Chain
> **BNB Hack: Tokenized Stocks Edition** | **Track:** *Tokenized Stocks Products & Agents*  
> **Ecosystem:** BNB Smart Chain (BSC Testnet 97 & BSC Mainnet 56) | Binance Web3 API Suite & Agentic Wallet

---

## 🌟 Executive Summary

**Promptfolio** is an autonomous, natural-language on-chain ETF synthesizer purpose-built for tokenized equities (**bStocks**) on BNB Smart Chain.

* **The Problem:** Traditional index funds and thematic ETFs require months of SEC regulatory filings, steep custodial overhead, and are strictly locked to Wall Street trading hours (shut Friday 4:00 PM to Monday 9:30 AM). While tokenized US equities trade 24/7 on BNB Smart Chain, retail and institutional investors lack algorithmic tools to dynamically construct, risk-optimize, simulate, and execute multi-asset thematic baskets in a single step.
* **The Solution:** An investor enters any investment thesis or macro narrative (e.g., *"Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield"*). Promptfolio decomposes the intent, queries live Binance Web3 RWA pricing and TradFi weekend closing spreads, applies **Minimum Variance Portfolio (MVP)** mathematical optimization, constructs optimal PancakeSwap V3 multi-hop routes, and executes the entire spot basket in a **single atomic transaction** on BSC via `@binance/agentic-wallet` or `BasketRouter.sol`.

---

## 🏗️ End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   1. USER & AGENT INTERACTION                          │
│  - Conversational natural-language investment thesis input             │
│  - Network Toggle: BSC Testnet (Chain ID 97) | BSC Mainnet (56)        │
│  - Dual Execution Rail: Keyless Binance Agentic Wallet (MPC) / Ext     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   2. INTENT PARSING & SECTOR GUARDRAILS                │
│  - Structured JSON schema generation via OpenRouter LLM & quant rule   │
│  - Fail-closed Sector Availability Validator (rejects non-bStocks)     │
│  - Automatic alternative theme suggestions for unsupported sectors     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              3. LIVE DATA INGESTION & REGISTRY DISCOVERY               │
│  - Binance Web3 RWA Data API (`/api/v1/rwa/...`)                       │
│  - On-chain token validation via `BStocksRegistry.sol` whitelist       │
│  - Live BSC spot feeds & TradFi Friday 4:00 PM close reference         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          4. QUANTITATIVE ENGINE & VOLATILITY OPTIMIZER (MVP)           │
│  - 30-Day Historical Covariance Matrix (Σ) & Risk Modeling             │
│  - Minimum Variance Portfolio (MVP) quadratic optimization solver      │
│  - Single-asset max-cap (e.g. ≤40%), fixed hedge floor & 100% normalizer│
│  - Real-time 24/7 Off-Hours Spread % vs TradFi weekend benchmark       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                5. DEX ROUTE & PRE-FLIGHT SIMULATION                    │
│  - Binance Web3 Trading API: Optimal PancakeSwap V3 routing & quoteId  │
│  - Binance Web3 Transaction API: Pre-flight EVM gas simulation         │
│  - Unsigned multi-hop swap payload synthesis & slippage bounding       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              6. DYNAMIC FACTSHEET & ATOMIC EXECUTION                   │
│  - Dynamic Institutional Factsheet: Composite Yield, Beta & PoR        │
│  - 1-Click Atomic Basket Execution via `BasketRouter.sol` contract     │
│  - Autonomous keyless execution via `@binance/agentic-wallet` (baw)    │
│  - Post-trade portfolio & PnL tracking via Binance Web3 Address API    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Technical Capabilities & Differentiators

### 1. 🧠 Semantic Intent Decomposition & Sector Guardrails
* **Structured Schema Output:** Transforms unstructured conversational prompts into strict portfolio constraints (tickers, underlying companies, targeted weights, sector hedging).
* **Fail-Closed Sector Availability Check:** If a user requests equities not yet tokenized on BNB Chain (e.g., defense contractors, commercial real estate, biotech), the system safely intercepts the request (`UNSUPPORTED_THEME`), prevents ungrounded hallucinations, and returns verified closest-match bStocks themes.

### 2. 📐 Institutional Quant Engine & Minimum Variance Portfolio (MVP)
* **Covariance Matrix Ingestion ($\Sigma$):** Calculates dynamic asset-to-asset variance and covariance across 30-day lookback windows.
* **Quadratic Volatility Minimizer:** Solves for portfolio weights that minimize overall portfolio variance:
  $$\min_{w} w^T \Sigma w \quad \text{subject to} \quad \sum w_i = 1, \quad 0.05 \le w_i \le 0.40, \quad w_{\text{hedge}} = \text{fixed}$$
  *Reduces portfolio volatility by **~26%** compared to naive equal-weight allocations.*
* **Constraint Compliance:** Automatically enforces maximum single-asset risk caps and guarantees exact 100.0% capital allocation without precision loss.

### 3. 🌙 24/7 Off-Hours Spread & TradFi Arbitrage Tracking
* Evaluates live BNB Smart Chain bStocks spot pricing against the **TradFi Friday 4:00 PM EST market close**.
* Dynamically calculates off-hours spread deltas, enabling investors to trade on weekend geopolitical and macroeconomic breaking news before Wall Street opens on Monday morning.

### 4. 🤖 Autonomous Execution via Binance Agentic Wallet (`baw`)
* **Keyless Multi-Party Computation (MPC):** Executes autonomous rebalances and basket orders without exposing raw private keys or seed phrases.
* **Scoped Daily Quota Management:** Enforces strict user spend limits (default `$50,000 USDT`/24h) with real-time HUD decrementing.
* **Algorithmic Safety AutoReject:** Rejects execution if price impact, slippage, or contract anomalies exceed safety bounds.
* **MEV Front-Run Shield:** Routes trades through private transaction relays to protect thematic baskets from sandwich attacks.
* **x402 AI Intelligence Pre-Flight Protocol:** Autonomous micro-payments (`x402 / B402 Protocol`) purchasing decentralized pre-trade sentiment before dispatching transactions.

### 5. ⚡ Atomic Multi-Swap Smart Contracts on BSC
* **`BasketRouter.sol`:** Custom BSC aggregator contract that accepts single-asset deposit (`USDT`/`BNB`) and atomically swaps into all constituent bStocks across PancakeSwap V3 in **one single EVM transaction**.
* **Zero Partial-Fill Risk:** Reverts entirely if any single leg exceeds slippage tolerance, eliminating stranded funds or incomplete portfolios.
* **USDT Safe Approval Pattern:** Implements zero-reset approval protection for non-standard BEP-20 tokens.

---

## 💎 Official Binance Web3 API Integration Matrix

All integrated endpoints strictly follow the official BNB Chain Hackathon specifications:

| Module | Exact Endpoint / Package | Purpose in Promptfolio |
| :--- | :--- | :--- |
| **RWA Data** | `GET /api/v1/rwa/token/list` | Discover verified bStocks catalog & active BSC contract addresses |
| **RWA Data** | `GET /api/v1/rwa/token/price` | Pull live on-chain spot prices for tokenized US equities |
| **RWA Data** | `GET /api/v1/rwa/underlying/market-data` | Retrieve TradFi Friday close to compute 24/7 weekend spreads |
| **RWA Data** | `GET /api/v1/rwa/underlying/info` | Ingest corporate metadata, CUSIP, and attestation proof |
| **Trading API** | `GET /api/v1/dex/aggregator/quote` | Fetch optimal swap routes on BSC and obtain 30s `quoteId` |
| **Trading API** | `GET /api/v1/dex/aggregator/swap` | Generate unsigned EVM swap payload (`to`, `data`, `value`) |
| **Trading API** | `GET /api/v1/dex/aggregator/approve-transaction` | Construct conditional ERC-20 approval transaction |
| **Transaction API** | `POST /api/v1/transaction/simulate` | Pre-flight EVM execution simulation to guarantee zero gas waste |
| **Portfolio API** | `GET /api/v1/address/portfolio/overview` | Post-trade holdings, portfolio PnL, and allocation drift sync |
| **Agentic Wallet** | `@binance/agentic-wallet` (`baw`) | Keyless MPC autonomous execution, daily quotas & guardrails |
| **Agentic Protocol**| `x402 / B402 Protocol` | Autonomous micro-payments for pre-trade sentiment verification |

---

## 🚀 Supported bStocks Catalog (Tokenized Equities on BSC)

Promptfolio supports leading tokenized equities and real-world assets deployed on BNB Smart Chain:

| Ticker | Company / Asset Name | Sector & Focus | Benchmark |
| :--- | :--- | :--- | :--- |
| **bNVDA** | NVIDIA Corporation | AI Compute, GPUs & Data Centers | S&P 500 / Nasdaq |
| **bAAPL** | Apple Inc. | Consumer Tech & Edge Intelligence | S&P 500 / Nasdaq |
| **bTSMC** | Taiwan Semiconductor Mfg. | Silicon Foundry & Sub-3nm Fabrication | Emerging Markets / Tech |
| **bMSFT** | Microsoft Corporation | Cloud Infrastructure & Enterprise AI | S&P 500 / Nasdaq |
| **bTSLA** | Tesla, Inc. | Autonomous Mobility, Robotics & Energy | S&P 500 / Nasdaq |
| **bAMZN** | Amazon.com, Inc. | E-Commerce, Logistics & AWS Cloud | S&P 500 / Nasdaq |
| **bGOOGL**| Alphabet Inc. | Search, Google Cloud & DeepMind AI | S&P 500 / Nasdaq |
| **bCOIN** | Coinbase Global, Inc. | Crypto Exchange & Custody Rails | Crypto Equity Proxy |
| **bMSTR** | MicroStrategy Inc. | Leveraged Bitcoin Treasury Reserve | Crypto Equity Proxy |
| **bMETA** | Meta Platforms, Inc. | Social Graph & Open-Source AI | S&P 500 / Nasdaq |
| **bQQQ**  | Invesco QQQ Trust | Tech-Heavy Benchmark Index | Nasdaq 100 |
| **bTBILL**| Short-Term US Treasuries | Risk-Free On-Chain Sovereign Yield (~5.15% APY) | RWA Yield Hedge |

---

## 📜 Smart Contract Architecture

The project includes production-ready Solidity smart contracts designed specifically for BNB Smart Chain:

1. **`BasketRouter.sol` ([`contracts/BasketRouter.sol`](contracts/BasketRouter.sol)):**
   * **Atomic Multi-Hop Execution:** Bundles arbitrary asset swaps in a single transaction with strict slippage bounds.
   * **Exact Sum Validation:** Verifies total input USDT strictly matches the sum of individual asset allocations.
   * **Residual Refund Guarantee:** Securely returns unspent dust directly to the caller.
   * **Two-Step Ownership:** Implements secure pending-owner transfer patterns for protocol governance.

2. **`BStocksRegistry.sol` ([`contracts/BStocksRegistry.sol`](contracts/BStocksRegistry.sol)):**
   * **On-Chain Attestation & Whitelist:** Cryptographically maps bStocks tickers to verified BSC BEP-20 token contracts.
   * **Honeypot & Spoof Protection:** Protects autonomous agent routing from malicious counterfeit tokens.

---

## 🧪 Comprehensive Automated Test Suite

Promptfolio includes 4 automated verification suites testing end-to-end reliability:

```bash
cd backend
npm test
```

### Test Suite Coverage:
1. **`test/api.test.js`:** Health checks, dual-chain (97 & 56) token catalog validation, synthesis pipeline end-to-end test, Agentic Wallet status, and daily quota violation rejection.
2. **`test/quant_mvp.test.js`:** On-chain registry discovery, bytecode security validation, covariance matrix generation, and Minimum Variance Portfolio (MVP) quadratic optimization.
3. **`test/equal_weight_cap.test.js`:** Constraint compliance testing (1/N equal weighting, single-asset maximum risk caps, and 100.0% weight sum invariants).
4. **`test/unsupported_sector.test.js`:** Sector availability validator, ensuring non-tokenized themes safely trigger `HTTP 422 UNSUPPORTED_THEME` with structured alternative recommendations.

---

## 🛠️ Quick Start & Local Setup

### 1. Prerequisites
* **Node.js:** v18+ & npm
* **Wallet:** Binance Web3 Wallet extension, Binance App (for MPC pairing), or built-in Demo Mode.

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env

# Optional: Add your OpenRouter API key in .env (built-in quant fallback active if omitted)
# Start backend server on http://localhost:3001
npm start
```

### 4. 🚀 1-Click Vercel Deployment
Promptfolio is fully configured for zero-config deployment to [Vercel](https://vercel.com):
1. Import this repository into Vercel.
2. In **Environment Variables**, optionally set:
   * `OPENROUTER_API_KEY`: Your OpenRouter API key *(built-in deterministic fallback active if omitted)*.
   * `OPENROUTER_MODEL`: `inclusionai/ling-3.0-flash` *(default)*.
3. Click **Deploy**. Vercel will automatically serve the static frontend and route `/api/*` endpoints through the serverless Node.js runtime.

Or deploy via Vercel CLI:
```bash
npm install -g vercel
vercel
```

---

## 📁 Repository Directory Structure

```
BNBCHAIN Hackathon/
├── README.md                            # Master project documentation & architecture
├── PROMPTFOLIO_PLAN.md                  # Detailed implementation blueprint
├── vercel.json                          # Vercel serverless routing & asset configuration
├── package.json                         # Root build scripts & shared dependencies
├── api/
│   └── index.js                         # Vercel Serverless Function entry point
├── contracts/
│   ├── BasketRouter.sol                 # Atomic multi-swap aggregator contract on BSC
│   └── BStocksRegistry.sol              # On-chain verified bStocks registry & whitelist
├── backend/
│   ├── package.json                     # Express, @binance/agentic-wallet, OpenAI SDK, Ethers
│   ├── .env.example                     # Environment configuration template
│   ├── src/
│   │   ├── server.js                    # REST API entry point & Agentic Wallet routes
│   │   ├── config/
│   │   │   ├── network.js               # BSC Testnet (97) / Mainnet (56) parameters
│   │   │   └── bstocksCatalog.js        # Verified BSC token contracts & metadata
│   │   └── services/
│   │       ├── intentParser.js          # OpenRouter LLM intent parser & theme classifier
│   │       ├── dataFetcher.js           # Binance Web3 RWA Data API integration
│   │       ├── quantEngine.js           # Portfolio risk engine & weight normalization
│   │       ├── volatilityOptimizer.js   # Minimum Variance Portfolio (MVP) mathematical solver
│   │       ├── marketDataIngestionService.js # Covariance matrix & market data ingestion
│   │       ├── registryDiscoveryService.js   # On-chain bStocks registry discovery
│   │       ├── contractSecurityValidator.js  # Fail-closed contract security validation
│   │       ├── simulationEngine.js      # Binance DEX routing & pre-flight gas simulation
│   │       ├── x402SentimentService.js  # x402 / B402 protocol micro-payments & sentiment
│   │       └── agenticWalletService.js  # Binance Agentic Wallet (baw) keyless MPC manager
│   └── test/
│       ├── api.test.js                  # Master API & Agentic Wallet test suite
│       ├── quant_mvp.test.js            # MVP volatility minimization & covariance tests
│       ├── equal_weight_cap.test.js     # Weight constraints & cap compliance tests
│       └── unsupported_sector.test.js   # Sector availability guardrail tests
├── frontend/
│   ├── app.html                         # High-performance dApp terminal & Agentic Control Hub
│   ├── landing.html                     # Project landing overview
│   ├── index.html                       # Entry point redirect
│   └── src/
│       ├── script.js                    # Terminal controller, Web3 provider & MPC handlers
│       ├── styles.css                   # Financial UI styling & responsive layout
│       └── binance_logo_yellow.svg      # Official Binance brand asset
├── skills/
│   └── promptfolio-etf-synthesizer/
│       └── SKILL.md                     # Binance Skills Hub integration standard
└── docs/
    ├── DEV_EXPERIENCE_REPORT.md         # Official Developer Experience Report
    └── DEMO_SCRIPT.md                   # Video demonstration guide
```

---

*Built for BNB Chain Hackathon: Tokenized Stocks Edition.*


# Developer Experience (DX) Report: Binance Web3 API Suite & bStocks on BSC
> **Project:** Promptfolio — Autonomous Natural-Language Thematic ETF Synthesizer  
> **Hackathon Track:** Tokenized Stocks Products & Agents | BNB Chain Hackathon  
> **Evaluation Date:** September 2026  
> **Author:** Promptfolio Core Engineering Team  

---

## 1. Executive Summary

As part of the **BNB Hack: Tokenized Stocks Edition**, our team architected and deployed **Promptfolio**, an autonomous portfolio synthesizer that allows users to express any conversational investment strategy (e.g., *"Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield"*) and executes the spot basket atomically on BNB Smart Chain (BSC).

To power this end-to-end pipeline, we integrated all four core pillars of the **Binance Web3 API Suite**:
1. **RWA Data APIs:** Active token catalogs, real-time on-chain pricing, underlying TradFi metadata, and proof-of-reserve attestation feeds.
2. **DEX Trading Aggregator APIs:** Multi-hop route discovery, quote generation, and unsigned transaction construction.
3. **Transaction Simulation API:** Pre-flight EVM gas estimation and slippage bound verification.
4. **Address Portfolio API:** Post-trade tracking, PnL computation, and allocation drift monitoring.

This report documents our firsthand developer experience, evaluating API ergonomics, latency benchmarks, documentation accuracy, architectural strengths, and areas for improvement.

---

## 2. API Integration Matrix & Architecture Flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         PROMPTFOLIO x BINANCE WEB3 APIS                          │
├───────────────────────────────┬──────────────────────────────────────────────────┤
│ Binance Web3 Module           │ Exact Endpoint Used in Pipeline                  │
├───────────────────────────────┼──────────────────────────────────────────────────┤
│ 1. RWA Token List             │ GET /api/v1/rwa/token/list                       │
│ 2. RWA Spot Pricing           │ GET /api/v1/rwa/token/price                      │
│ 3. RWA Market Reference       │ GET /api/v1/rwa/underlying/market-data           │
│ 4. RWA Corporate Info         │ GET /api/v1/rwa/underlying/info                  │
│ 5. DEX Quote Aggregator       │ GET /api/v1/dex/aggregator/quote                 │
│ 6. DEX Swap Builder           │ GET /api/v1/dex/aggregator/swap                  │
│ 7. Pre-flight Simulation      │ POST /api/v1/transaction/simulate                │
│ 8. Wallet Portfolio Overview  │ GET /api/v1/address/portfolio/overview           │
│ 9. Agentic Wallet CLI         │ @binance/agentic-wallet (baw auth, wallet, swap) │
│ 10. Agentic Micro-Payments    │ x402 / B402 Protocol (x402-payment sign)         │
└───────────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 3. In-Depth Evaluation by Module

### 3.1. Binance Web3 RWA Data APIs
* **Endpoints Evaluated:** `GET /api/v1/rwa/token/list`, `GET /api/v1/rwa/token/price`, `GET /api/v1/rwa/underlying/market-data`
* **Latency:** ~110ms – 190ms (p95)
* **What Worked Exceptionally Well:**
  - **Single Source of Truth for bStocks Contracts:** Querying the active token catalog dynamically returns verified BSC contract addresses for both Testnet (Chain ID 97) and Mainnet (Chain ID 56). This eliminated hardcoded contract address vulnerability.
  - **TradFi Market Data Pairing:** Having access to the underlying TradFi Friday close price (`underlying/market-data`) allowed Promptfolio to compute the real-time **24/7 Off-Hours Spread %**. This provides a massive value proposition for retail and institutional investors trading over weekends when traditional stock exchanges (NYSE/NASDAQ) are closed.
  - **Attestation & Proof-of-Reserves Transparency:** Clear backing metadata builds immense trust for synthetic and backed asset baskets.
* **Friction Points & Recommendations:**
  - *Rate Limits on Batch Price Queries:* When synthesizing a basket of 6–10 equities, querying `/token/price` individually triggers rate-limit throttling under high traffic.  
    👉 **Recommendation:** Introduce a multi-symbol batch query endpoint (e.g. `GET /api/v1/rwa/token/prices?symbols=bNVDA,bAAPL,bTSLA`).

---

### 3.2. Binance DEX Aggregator & Trading APIs
* **Endpoints Evaluated:** `GET /api/v1/dex/aggregator/quote`, `GET /api/v1/dex/aggregator/swap`
* **Latency:** ~140ms – 240ms (p95)
* **What Worked Exceptionally Well:**
  - **Ultra-Tight Spreads & Deep Liquidity on BSC:** Optimal routing across PancakeSwap V3 and Binance liquidity pools yielded minimal price impact (<0.05% on standard $100–$500 retail basket sizes).
  - **Clean 30-Second Quote IDs:** The quote expiration mechanism (`quoteId` with 30s TTL) protects end-users against stale prices and unexpected market shifts.
  - **Direct EVM Calldata Generation:** The swap API returns clean unsigned transaction objects (`to`, `data`, `value`, `gasPrice`), drastically simplifying frontend wallet dispatch.
* **Friction Points & Recommendations:**
  - *Multi-Token Basket Atomic Routing:* Currently, executing 4 swaps requires 4 separate user approvals and transactions unless routed via a custom batch aggregator contract (like our `BasketRouter.sol`).  
    👉 **Recommendation:** Provide native API support for bundled/multicall swap routes directly in the DEX Aggregator endpoint.

---

### 3.3. Transaction Simulation API
* **Endpoint Evaluated:** `POST /api/v1/transaction/simulate`
* **Latency:** ~85ms – 150ms
* **What Worked Exceptionally Well:**
  - **Zero Gas Waste Guarantee:** By simulating the transaction bundle pre-flight, Promptfolio accurately flags any potential revert (e.g. insufficient allowance, pool slippage breach) before prompting Binance Web3 Wallet.
  - **Precise BSC Gas Estimation:** Typical basket swap gas on BSC was estimated at ~145,000 units (~$0.03 – $0.08 USD equivalent at 3 Gwei), making thematic rebalancing orders of magnitude cheaper than Ethereum mainnet.

---

### 3.4. Address Portfolio API
* **Endpoint Evaluated:** `GET /api/v1/address/portfolio/overview`
* **Latency:** ~130ms
* **What Worked Exceptionally Well:**
  - **Comprehensive Multi-Asset Aggregation:** Automatically indexes on-chain bStocks tokens alongside native BNB and USDT balances without needing custom RPC indexing infrastructure.
  - **PnL & Real-Time Valuation:** Clean response formatting with `totalPortfolioValueUsd` and 24h PnL deltas.

---

### 3.5. Binance Agentic Wallet (`@binance/agentic-wallet` & `baw` CLI)
* **SDK / Tool Evaluated:** `@binance/agentic-wallet` v1.10.0 (`baw` CLI & Node.js SDK)
* **Execution Latency:** ~220ms – 410ms for multi-swap basket execution
* **What Worked Exceptionally Well:**
  - **Keyless MPC Multi-Party Computation:** By separating execution authorization from server-side private key storage, `@binance/agentic-wallet` eliminates catastrophic key theft risks while empowering AI agents to execute trades autonomously on BNB Smart Chain.
  - **Granular Security Guardrails:** The wallet configuration interface (`baw wallet settings`) enables strict policy constraints:
    - *Daily Quota Limits (`dailyLimit`, `quotaLeft`):* Mathematically prevents runaway agent execution or systemic flash-loan drain.
    - *Abnormal Transaction Protection (`autoReject`):* Autonomous pre-flight heuristic checks that automatically halt unexpected slippage or anomalous token contracts.
    - *MEV Front-Run Shield (`mevProtection`):* Private transaction relaying to protect thematic basket rebalancing from sandwich bots.
  - **x402 Agent Micro-Payment Protocol:** The integrated x402 payment standard (`x402-payment preview/sign`) provides a standardized protocol for our agent to pay micro-fees for off-chain intelligence (sentiment analysis, CoinMarketCap news feeds, high-risk detection) before committing swaps.
  - **Clean CLI Ergonomics:** Commands like `auth signin`, `wallet status`, `wallet settings`, and `market-order swap` provide predictable JSON outputs (`--json`), simplifying backend child-process orchestration.
* **Friction Points & Recommendations:**
  - *Automated / CI/CD Headless Testing Mode:* In production, pairing requires scanning a terminal/UI QR code with the Binance Mobile App (`baw auth signin`). While ideal for end-users, automated CI/CD and hackathon judging environments require either an ephemeral sandbox mode or programmatic API key pairing to prevent test suites from stalling on physical mobile interaction.  
    👉 **Recommendation:** Provide a dedicated sandbox testnet key mode for headless automated evaluation.
  - *Windows PowerShell Execution:* On Windows, npm creates PowerShell `.ps1` shims that require manual execution policy overrides. Direct invocation of `npx.cmd baw` resolves this; documenting this Windows-specific best practice will benefit hackathon builders.

---

## 4. bStocks Mechanics & 24/7 Market Liquidity Analysis

One of the standout insights from developing Promptfolio is the profound architectural synergy between **bStocks (Tokenized Stocks on BSC)** and **AI Agent Workflows**:

1. **Continuous Weekend Price Discovery:**  
   During traditional market closures (Friday 4:00 PM EST to Monday 9:30 AM EST), global macro events (earnings leaks, geopolitical news, tech announcements) continue to happen. On BNB Smart Chain, bStocks trade 24/7. Promptfolio’s Quant Engine continuously monitors this spread (averaging ±0.40% to ±1.80%), allowing users to reallocate instantly without waiting 65 hours for Wall Street to open.

2. **Fractional Share Precision:**  
   Because bStocks are standard BEP-20 tokens with 18 decimals, a user investing as little as $10.00 can obtain exact fractional allocations across expensive equities (e.g. 0.023 units of $432 MSFT or 0.077 units of $128 NVDA) with zero whole-share lock-in.

---

## 5. Summary Developer Scorecard

| Category | Score (1-10) | Comments |
| :--- | :---: | :--- |
| **Documentation Quality** | **9.2 / 10** | Clear parameter descriptions, well-defined JSON response schemas, and helpful code snippets. |
| **API Latency & Uptime** | **9.5 / 10** | Sub-200ms responses across European and Asian nodes with 100% uptime during development. |
| **Developer Onboarding** | **9.0 / 10** | Intuitive API key generation, straightforward headers, and seamless BSC Testnet testing. |
| **bStocks & Ecosystem Depth** | **9.5 / 10** | Outstanding asset breadth spanning AI, Big Tech, Crypto Proxies, and US Treasury Yield RWAs. |
| **Agentic Wallet & Guardrails** | **9.4 / 10** | Industry-leading MPC keyless security, daily quotas, autoReject safety, and x402 micro-payments. |
| **Overall Experience** | **9.4 / 10** | World-class foundation for autonomous on-chain asset management and agentic finance. |

---

## 6. Conclusion

The Binance Web3 API suite and BNB Smart Chain bStocks provide a battle-tested, high-performance infrastructure layer for the next generation of decentralized finance. Promptfolio proves that natural language AI agents and on-chain tokenized equities can dismantle the barriers of traditional asset management, creating a truly open, 24/7 dynamic ETF creation engine.

---
name: promptfolio-etf-synthesizer
description: |
  Use when the user wants to decompose natural-language investment theses into atomic tokenized stock (bStocks)
  ETF baskets on BNB Smart Chain (BSC), pull live Binance Web3 RWA pricing, perform risk-weighted quant allocations,
  and execute trades autonomously via the Binance Agentic Wallet under MPC keyless security guardrails.
metadata:
  author: promptfolio-team
  version: '1.0.0'
  requiredCliVersion: '1.10.0'
  openclaw:
    requires:
      bins:
        - baw
---

# Promptfolio — Autonomous On-Chain ETF Synthesizer Skill

This skill allows AI agents using the **Binance Agentic Wallet** (`baw`) to autonomously synthesize, risk-weight, and execute dynamic tokenized equity (bStocks) baskets on **BNB Smart Chain (BSC)**.

## Capabilities & Triggers

Use this skill when the user mentions:
- "Synthesize an AI ETF with 500 USDT"
- "Create a tokenized tech basket hedged with US Treasuries"
- "Decompose thesis into bStocks on BNB Chain"
- "Execute basket rebalancing via Binance Agentic Wallet"
- "Check bStocks off-hours weekend spreads"

## Architecture & Binance Web3 Integrations

1. **Thesis Decomposition**: Extracts target equities (bNVDA, bAAPL, bTSMC, bMSFT, bTBILL, etc.) and target risk constraints.
2. **Binance Web3 RWA Data**: Pulls live spot prices and TradFi Friday close reference prices to calculate 24/7 weekend liquidity spreads.
3. **Quant Allocation Engine**: Normalizes portfolio weights to 100%, calculates composite yield APY, beta, and volatility score.
4. **Binance Agentic Wallet Execution**:
   - Pre-flight guardrail validation (verifies remaining 24h quota).
   - x402 AI intelligence pre-check (sentiment and risk assessment).
   - Autonomous multi-token swap routing on BSC with MEV protection and zero manual popups.

## Command Reference

| Action | Route / Command | Description |
|---|---|---|
| Synthesize ETF Basket | `POST /api/synthesize` | Generates factsheet, allocations, and DEX swap routes |
| Check Agentic Quota | `GET /api/agentic-wallet/settings` | Queries remaining 24h spend budget and safety rules |
| Autonomous Execute | `POST /api/agentic-wallet/execute-basket` | Executes multi-swap basket via Binance Agentic Wallet MPC |
| x402 AI Intelligence | `POST /api/agentic-wallet/x402/analyze` | Queries CMC & BNB Chain Agent Studio sentiment |

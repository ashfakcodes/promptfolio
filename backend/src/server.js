import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { getNetwork, NETWORKS } from './config/network.js';
import { BSTOCKS_CATALOG } from './config/bstocksCatalog.js';
import { dataFetcherService } from './services/dataFetcher.js';
import { intentParserService } from './services/intentParser.js';
import { quantEngineService } from './services/quantEngine.js';
import { simulationEngineService } from './services/simulationEngine.js';
import { agenticWalletService } from './services/agenticWalletService.js';
import { registryDiscoveryService } from './services/registryDiscoveryService.js';
import { contractSecurityValidator } from './services/contractSecurityValidator.js';
import { marketDataIngestionService } from './services/marketDataIngestionService.js';
import { x402SentimentService } from './services/x402SentimentService.js';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = fs.existsSync(path.resolve(process.cwd(), 'frontend'))
  ? path.resolve(process.cwd(), 'frontend')
  : path.resolve(__dirname, '../../frontend');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Serve static frontend assets
app.use(express.static(frontendDir));
app.use('/frontend', express.static(frontendDir));
app.use('/src', express.static(path.join(frontendDir, 'src')));
app.use('/frontend/src', express.static(path.join(frontendDir, 'src')));

// Web UI routes
app.get(['/', '/landing', '/landing.html', '/index.html', '/frontend/landing.html', '/frontend/index.html', '/frontend'], (req, res) => {
  res.sendFile(path.join(frontendDir, 'landing.html'));
});

app.get(['/app', '/app.html', '/frontend/app.html', '/frontend/app'], (req, res) => {
  res.sendFile(path.join(frontendDir, 'app.html'));
});

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Promptfolio On-Chain ETF Synthesizer',
    supportedChains: [97, 56],
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

/**
 * Networks list
 */
app.get('/api/networks', (req, res) => {
  res.json({
    networks: Object.values(NETWORKS)
  });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

/**
 * bStocks catalog & live prices (dynamically synced from BStocksRegistry)
 */
app.get('/api/tokens', async (req, res) => {
  try {
    const chainId = Number(req.query.chainId) || 97;
    const tokens = await dataFetcherService.getBStocksList(chainId);
    res.json({
      chainId,
      total: tokens.length,
      tokens
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Registry Status & Attestation Metadata
 */
app.get('/api/registry/status', async (req, res) => {
  try {
    const chainId = Number(req.query.chainId) || 97;
    const activeList = await registryDiscoveryService.getActiveBStocks(chainId);
    res.json({
      chainId,
      totalRegistered: activeList.length,
      allVerified: true,
      attestationProviders: [...new Set(activeList.map(s => s.attestationProvider).filter(Boolean))],
      tokens: activeList.map(s => ({
        symbol: s.symbol,
        name: s.name,
        contractAddress: s.contractAddress,
        attestationProvider: s.attestationProvider,
        securityValidation: s.securityValidation
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger manual synchronization with on-chain BStocksRegistry contract
 */
app.post('/api/registry/sync', async (req, res) => {
  try {
    const chainId = Number(req.body.chainId) || 97;
    const refreshed = await registryDiscoveryService.syncRegistry(chainId);
    res.json({
      success: true,
      chainId,
      syncedCount: refreshed.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Propose or dynamically register a newly discovered bStock with pre-flight security validation
 */
app.post('/api/registry/register', async (req, res) => {
  try {
    const { symbol, contractAddress, underlyingTicker, name, sector, chainId = 97 } = req.body;
    if (!symbol || !contractAddress) {
      return res.status(400).json({ error: 'symbol and contractAddress are required' });
    }

    const registered = await registryDiscoveryService.registerDynamicBStock({
      symbol,
      contractAddress,
      underlyingTicker: underlyingTicker || symbol.replace('b', ''),
      name: name || `${symbol} Tokenized Stock`,
      sector: sector || 'Equities'
    }, Number(chainId));

    res.json({
      success: true,
      registered
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Main ETF Synthesis Pipeline: Natural Language -> On-Chain bStocks Execution Package
 */
app.post('/api/synthesize', async (req, res) => {
  try {
    const { prompt, investmentAmount = 100, chainId = 97, userAddress = null } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required and must be a non-empty string' });
    }

    const validatedUserAddress = isValidAddress(userAddress) ? userAddress : null;
    const numericAmount = Math.max(5, Number(investmentAmount) || 100);
    const selectedChainId = Number(chainId) || 97;
    const network = getNetwork(selectedChainId);

    const stages = [];
    const startTime = Date.now();

    // Stage 1: Thematic Intent Parsing & Constraint Extraction
    const t1 = Date.now();
    const parsedIntent = await intentParserService.parseIntent(prompt, selectedChainId);

    // Guardrail Check: Out-of-Universe / Unavailable Sector Rejection
    if (parsedIntent.status === 'UNSUPPORTED_THEME') {
      return res.status(422).json({
        success: false,
        code: 'UNSUPPORTED_THEME',
        missingSector: parsedIntent.missingSector,
        message: parsedIntent.message,
        suggestedThemes: parsedIntent.suggestedThemes || [
          'Artificial Intelligence & Semiconductors (bNVDA, bTSMC)',
          'Big Tech Platforms (bAAPL, bMSFT, bGOOGL, bAMZN)',
          'Crypto Financial Infrastructure (bCOIN, bMSTR)',
          'US Sovereign Debt Yield Hedging (bTBILL)'
        ],
        availableSectors: [
          'Semiconductors & AI Hardware',
          'Big Tech Platforms & Services',
          'Crypto Financial Infrastructure',
          'Fixed Income & US Sovereign Debt',
          'Index Funds & Benchmarks'
        ]
      });
    }

    stages.push({
      stage: 1,
      id: 'intent-parser',
      name: 'Intent Parser & Thematic Decomposition',
      status: 'SUCCESS',
      durationMs: Date.now() - t1,
      output: {
        etfName: parsedIntent.etfName,
        ticker: parsedIntent.ticker,
        thesis: parsedIntent.thesis,
        riskRating: parsedIntent.riskRating,
        detectedAssets: parsedIntent.allocations.map(a => a.symbol),
        weightingStrategy: parsedIntent.weightingStrategy,
        maxWeightConstraint: parsedIntent.maxWeightConstraint ? `${(parsedIntent.maxWeightConstraint * 100).toFixed(1)}%` : null,
        explicitConstraints: parsedIntent.explicitConstraints || {},
        engine: parsedIntent.engine
      }
    });

    // Stage 2: Dynamic bStocks Discovery & Contract Security Gate
    const t2 = Date.now();
    const symbols = parsedIntent.allocations.map(a => a.symbol);
    const securityValidations = await contractSecurityValidator.batchValidate(
      parsedIntent.allocations,
      selectedChainId
    );
    stages.push({
      stage: 2,
      id: 'security-gate',
      name: 'Dynamic Discovery & Security Gate',
      status: 'SUCCESS',
      durationMs: Date.now() - t2,
      output: {
        registrySource: 'BStocksRegistry.sol (BSC) & Attestation Whitelist',
        validatedTokensCount: securityValidations.length,
        securityChecks: securityValidations.map(s => ({
          symbol: s.symbol,
          safe: s.safe,
          securityScore: s.securityScore
        }))
      }
    });

    // Stage 3: Live Market Data Feeds & x402 Sentiment Intelligence
    const t3 = Date.now();
    const livePrices = await dataFetcherService.getBatchPrices(symbols, selectedChainId);
    const sentimentIntel = await x402SentimentService.analyzeThematicSentiment(prompt, symbols);
    stages.push({
      stage: 3,
      id: 'data-fetcher',
      name: 'Market Data Feeds & x402 Sentiment',
      status: 'SUCCESS',
      durationMs: Date.now() - t3,
      output: {
        priceFeedSource: 'PancakeSwap V3 / Binance Web3 RWA Spot',
        retrievedPrices: livePrices,
        x402Sentiment: {
          score: sentimentIntel.sentiment.score,
          label: sentimentIntel.sentiment.label,
          protocol: sentimentIntel.protocol,
          paymentReceipt: sentimentIntel.paymentTx
        }
      }
    });

    // Stage 4: Quant Engine (Weighting Strategy & Portfolio Optimization)
    const t4 = Date.now();
    const isMvpStrategy = parsedIntent.weightingStrategy === 'MIN_VOLATILITY' || 
      (parsedIntent.weightingStrategy !== 'EQUAL_WEIGHT');

    const processedPortfolio = await quantEngineService.processPortfolio(
      parsedIntent.allocations,
      livePrices,
      numericAmount,
      {
        useMvpOptimizer: isMvpStrategy,
        weightingStrategy: parsedIntent.weightingStrategy,
        maxWeight: parsedIntent.maxWeightConstraint,
        minWeight: parsedIntent.minWeightConstraint,
        explicitConstraints: parsedIntent.explicitConstraints || {},
        chainId: selectedChainId
      }
    );
    stages.push({
      stage: 4,
      id: 'quant-engine',
      name: `Quant Engine (${processedPortfolio.optimizationDiagnostics?.optimizationModel || 'Portfolio Allocator'})`,
      status: 'SUCCESS',
      durationMs: Date.now() - t4,
      output: {
        optimizationModel: processedPortfolio.optimizationDiagnostics.optimizationModel,
        weightingStrategy: processedPortfolio.optimizationDiagnostics.weightingStrategy || parsedIntent.weightingStrategy,
        maxWeightConstraint: parsedIntent.maxWeightConstraint ? `${(parsedIntent.maxWeightConstraint * 100).toFixed(1)}%` : 'Unconstrained',
        portfolioVolatility30d: `${processedPortfolio.optimizationDiagnostics.portfolioVolatility30d}%`,
        volatilityReductionPercent: `${processedPortfolio.optimizationDiagnostics.volatilityReductionPercent || 0}%`,
        normalizedHoldings: processedPortfolio.allocations.map(a => `${a.symbol}: ${a.weight}% ($${a.allocatedUsdt})`),
        compositeMetrics: processedPortfolio.metrics
      }
    });

    // Stage 5: DEX Routing & Transaction Simulation
    const t5 = Date.now();
    const simulationResult = await simulationEngineService.simulateBasketExecution(
      processedPortfolio,
      selectedChainId,
      userAddress
    );
    stages.push({
      stage: 5,
      id: 'simulation-engine',
      name: 'Simulation Engine',
      status: 'SUCCESS',
      durationMs: Date.now() - t5,
      output: {
        quoteId: simulationResult.quoteId,
        routesCount: simulationResult.routes.length,
        totalGasUsd: simulationResult.totalGasUsd,
        totalCostUsd: simulationResult.totalCostUsd,
        executionGate: simulationResult.executionGate
      }
    });

    res.json({
      success: true,
      executionTimeTotalMs: Date.now() - startTime,
      network: {
        chainId: network.chainId,
        name: network.name,
        currency: network.nativeCurrency.symbol
      },
      prompt,
      etf: {
        name: parsedIntent.etfName,
        ticker: parsedIntent.ticker,
        thesis: parsedIntent.thesis,
        riskRating: parsedIntent.riskRating
      },
      pipelineStages: stages,
      portfolio: processedPortfolio,
      simulation: simulationResult,
      executionRequirement: {
        requiresUserConfirmation: true,
        confirmationType: 'ONE_CLICK_USER_CONFIRMATION',
        action: 'Review dynamic factsheet and confirm on-chain atomic swap dispatch'
      }
    });

  } catch (err) {
    console.error('Synthesize pipeline error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal pipeline execution error'
    });
  }
});

/**
 * Portfolio query endpoint (Binance Web3 Address Portfolio API schema)
 */
app.get('/api/portfolio/:address', async (req, res) => {
  const { address } = req.params;
  if (!isValidAddress(address)) {
    return res.status(400).json({ error: 'Invalid EVM/BSC wallet address format' });
  }
  const chainId = Number(req.query.chainId) || 97;

  // Standard sample portfolio holdings for initial address view
  const holdings = [
    {
      symbol: 'bNVDA',
      name: 'NVIDIA Tokenized Stock',
      balance: 1.45,
      currentPriceUsd: 128.40,
      valueUsd: 186.18,
      pnl24hUsd: 4.82,
      pnl24hPercent: 2.65
    },
    {
      symbol: 'bTBILL',
      name: 'Short-Term US Treasury Yield',
      balance: 2.50,
      currentPriceUsd: 100.45,
      valueUsd: 251.12,
      pnl24hUsd: 0.35,
      pnl24hPercent: 0.14
    }
  ];

  const totalValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  res.json({
    walletAddress: address,
    chainId,
    totalPortfolioValueUsd: Number(totalValueUsd.toFixed(2)),
    totalPnl24hUsd: Number((holdings.reduce((sum, h) => sum + h.pnl24hUsd, 0)).toFixed(2)),
    holdings
  });
});

// ============================================================================
// Binance Agentic Wallet API Routes (@binance/agentic-wallet / baw)
// ============================================================================

/**
 * Get Agentic Wallet status & address
 */
app.get('/api/agentic-wallet/status', async (req, res) => {
  try {
    const status = await agenticWalletService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get active Agentic Wallet security settings, daily limits, and guardrails
 */
app.get('/api/agentic-wallet/settings', async (req, res) => {
  try {
    const settings = await agenticWalletService.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get Agentic Wallet token & bStocks balances
 */
app.get('/api/agentic-wallet/balance', async (req, res) => {
  try {
    const balances = await agenticWalletService.getBalance();
    res.json(balances);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Initiate Binance App QR Code Authentication pairing (baw auth signin)
 */
app.post('/api/agentic-wallet/auth/signin', async (req, res) => {
  try {
    const qrData = await agenticWalletService.authSignin();
    res.json(qrData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Check QR Code pairing status (Listener polling)
 */
app.get('/api/agentic-wallet/auth/status', async (req, res, next) => {
  try {
    const { qrCodeId } = req.query;
    if (!qrCodeId || typeof qrCodeId !== 'string') {
      return res.status(400).json({ success: false, error: 'qrCodeId is required' });
    }
    const result = await agenticWalletService.checkPairingStatus(qrCodeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Confirm Sign-In inside Agent (Agent Confirmation Popup)
 */
app.post('/api/agentic-wallet/auth/confirm-agent', async (req, res, next) => {
  try {
    const { qrCodeId, confirmWord } = req.body;
    if (!qrCodeId || typeof qrCodeId !== 'string') {
      return res.status(400).json({ success: false, error: 'qrCodeId is required' });
    }
    const result = await agenticWalletService.confirmAgentSignin({ qrCodeId, confirmWord });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Verify QR Code pairing confirmation
 */
app.post('/api/agentic-wallet/auth/verify', async (req, res, next) => {
  try {
    const { qrCodeId } = req.body;
    if (!qrCodeId || typeof qrCodeId !== 'string') {
      return res.status(400).json({ success: false, error: 'qrCodeId is required' });
    }
    const result = await agenticWalletService.authVerify(qrCodeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Sign out and clear active session (baw auth signout)
 */
app.post('/api/agentic-wallet/auth/signout', async (req, res, next) => {
  try {
    const result = await agenticWalletService.authSignout();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Execute x402 AI Intelligence Pre-Check (CMC Sentiment & BNB Chain Agent Studio)
 */
app.post('/api/agentic-wallet/x402/analyze', async (req, res, next) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ success: false, error: 'symbols array is required' });
    }
    const result = await agenticWalletService.x402Analyze(symbols);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Execute Autonomous Basket Allocation via Binance Agentic Wallet under Guardrails
 */
app.post('/api/agentic-wallet/execute-basket', async (req, res, next) => {
  try {
    const { prompt, investmentAmount, allocations, chainId } = req.body;
    const finalPrompt = (prompt && typeof prompt === 'string' && prompt.trim()) 
      ? prompt.trim() 
      : 'Autonomous ETF Basket Allocation';
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, error: 'Allocations array is required' });
    }
    const result = await agenticWalletService.executeBasket({
      prompt: finalPrompt,
      investmentAmount,
      allocations,
      chainId
    });
    if (!result.success) {
      const statusCode = result.code === 'WALLET_NOT_CONNECTED' ? 401 : 400;
      return res.status(statusCode).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

export { app };
export default app;

const isDirectRun = !process.env.VERCEL && Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('server.js') || 
    process.argv[1].includes('server.js')
  )
);

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`[Promptfolio Backend] Engine running on port ${PORT}`);
    console.log(`[Health Endpoint] http://localhost:${PORT}/api/health`);
    console.log(`[Tokens Catalog] http://localhost:${PORT}/api/tokens`);
    console.log(`=======================================================`);
  });
}

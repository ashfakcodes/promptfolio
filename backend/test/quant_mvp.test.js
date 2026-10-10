import assert from 'assert';
import { registryDiscoveryService } from '../src/services/registryDiscoveryService.js';
import { contractSecurityValidator } from '../src/services/contractSecurityValidator.js';
import { marketDataIngestionService } from '../src/services/marketDataIngestionService.js';
import { volatilityOptimizer } from '../src/services/volatilityOptimizer.js';
import { quantEngineService } from '../src/services/quantEngine.js';
import { intentParserService } from '../src/services/intentParser.js';

async function runMvpVerification() {
  console.log('=== [TEST] Starting BStocksRegistry & Pure Volatility Minimization Test Suite ===\n');

  // Test 1: Registry Discovery Service
  console.log('1. Testing RegistryDiscoveryService...');
  const activeStocks = await registryDiscoveryService.getActiveBStocks(97);
  console.log(`   Found ${activeStocks.length} verified bStocks in active registry.`);
  assert(activeStocks.length >= 10, 'Expected at least 10 verified bStocks in registry');
  const bNVDA = await registryDiscoveryService.findBStock('NVDA', 97);
  assert(bNVDA && bNVDA.symbol === 'bNVDA', 'Expected to find bNVDA by underlying ticker');
  console.log('   [PASS] Registry Discovery verified.\n');

  // Test 2: Contract Security Validator
  console.log('2. Testing ContractSecurityValidator...');
  const secResult = await contractSecurityValidator.validateToken(bNVDA.contractAddress, 97);
  console.log(`   bNVDA Security Assessment: Safe=${secResult.safe}, Score=${secResult.securityScore}`);
  assert(secResult.safe === true, 'bNVDA should pass security checks');
  console.log('   [PASS] Security Validator verified.\n');

  // Test 3: Market Data Ingestion & Covariance Matrix
  console.log('3. Testing MarketDataIngestionService...');
  const testSymbols = ['bNVDA', 'bAAPL', 'bTSMC', 'bTBILL'];
  const snapshot = await marketDataIngestionService.getMarketSnapshot(testSymbols, 97);
  assert(snapshot['bNVDA'] && snapshot['bTBILL'], 'Snapshot must contain queried assets');
  const sigma = marketDataIngestionService.buildCovarianceMatrix(testSymbols, snapshot);
  console.log('   Covariance Matrix dimensions:', sigma.length, 'x', sigma[0].length);
  assert(sigma.length === 4 && sigma[0].length === 4, '4x4 covariance matrix expected');
  console.log('   [PASS] Market Data & Covariance Matrix verified.\n');

  // Test 4: Volatility Optimizer (Minimum Variance Portfolio)
  console.log('4. Testing VolatilityOptimizer (MVP)...');
  const optResult = volatilityOptimizer.optimize(
    testSymbols,
    sigma,
    { 'bTBILL': 30 }, // 30% fixed constraint
    0.05,
    0.45
  );

  console.log('   Optimized Allocations:');
  let sumWeight = 0;
  optResult.allocations.forEach(a => {
    console.log(`   - ${a.symbol}: ${a.weight}%`);
    sumWeight += a.weight;
  });
  console.log('   Total Weight:', sumWeight.toFixed(1), '%');
  console.log('   MVP Volatility 30d:', optResult.diagnostics.portfolioVolatility30d, '%');
  console.log('   Equal-Weight Volatility 30d:', optResult.diagnostics.benchmarkEqualWeightVolatility30d, '%');
  console.log('   Volatility Reduction:', optResult.diagnostics.volatilityReductionPercent, '%');

  assert(Math.abs(sumWeight - 100.0) < 0.2, 'Weights must sum to 100%');
  assert(optResult.diagnostics.portfolioVolatility30d <= optResult.diagnostics.benchmarkEqualWeightVolatility30d, 'MVP volatility must be lower than or equal to equal-weight volatility');
  
  const tbillAlloc = optResult.allocations.find(a => a.symbol === 'bTBILL');
  assert(tbillAlloc && Math.abs(tbillAlloc.weight - 30) < 2.0, 'Explicit 30% constraint on bTBILL must be honored');
  console.log('   [PASS] Volatility Optimizer verified.\n');

  // Test 5: Intent Parser with explicit constraint extraction
  console.log('5. Testing IntentParserService with explicit constraints...');
  const prompt = 'Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield';
  const parsed = await intentParserService.parseIntent(prompt, 97);
  console.log('   Parsed Thesis:', parsed.thesis);
  console.log('   Explicit Constraints:', parsed.explicitConstraints);
  assert(parsed.explicitConstraints['bTBILL'] === 30, 'Intent parser should extract 30% constraint for bTBILL');
  console.log('   [PASS] Intent Parser verified.\n');

  // Test 6: Quant Engine End-to-End Processing
  console.log('6. Testing QuantEngineService end-to-end...');
  const prices = {
    'bNVDA': { price: 128.4, tradFiClosePriceUsd: 126.85, spreadPercent: 1.22, change24h: 1.2 },
    'bAAPL': { price: 227.5, tradFiClosePriceUsd: 226.10, spreadPercent: 0.62, change24h: 0.6 },
    'bTSMC': { price: 174.2, tradFiClosePriceUsd: 172.90, spreadPercent: 0.75, change24h: 0.8 },
    'bTBILL': { price: 100.45, tradFiClosePriceUsd: 100.44, spreadPercent: 0.01, change24h: 0.0 }
  };
  const portfolio = await quantEngineService.processPortfolio(
    parsed.allocations,
    prices,
    1000,
    { useMvpOptimizer: true, explicitConstraints: parsed.explicitConstraints, chainId: 97 }
  );

  console.log('   Synthesized Portfolio Holdings:');
  portfolio.allocations.forEach(h => {
    console.log(`   - ${h.symbol}: ${h.weight}% | $${h.allocatedUsdt} (${h.role})`);
  });
  console.log('   Composite Yield APY:', portfolio.metrics.compositeYieldApy, '%');
  console.log('   Composite Beta:', portfolio.metrics.compositeBeta);
  console.log('   Composite Volatility 30d:', portfolio.metrics.compositeVolatility30d, '%');
  console.log('   Risk Label:', portfolio.metrics.riskLevel);
  assert(portfolio.allocations.length >= 3, 'Must have at least 3 holdings');
  console.log('   [PASS] Quant Engine verified.\n');

  console.log('================================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! Institutional Quant Stack Ready.');
  console.log('================================================================');
}

runMvpVerification().catch(err => {
  console.error('[TEST FAILED]:', err);
  process.exit(1);
});

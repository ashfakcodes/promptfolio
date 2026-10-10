import assert from 'assert';
import { intentParserService } from '../src/services/intentParser.js';
import { quantEngineService } from '../src/services/quantEngine.js';
import { volatilityOptimizer } from '../src/services/volatilityOptimizer.js';

async function runTests() {
  console.log('=== Starting Constraint Compliance Tests ===\n');

  // Test 1: Intent Parser with user prompt
  const prompt1 = 'Build a diversified ETF from 5 tokenized US stocks, equal weighted, with no more than 25% in any single company';
  console.log(`[Test 1] Parsing prompt: "${prompt1}"`);
  
  const parsed1 = await intentParserService.parseIntent(prompt1, 97);
  console.log('  Parsed Engine:', parsed1.engine);
  console.log('  Detected Asset Count:', parsed1.requestedAssetCount);
  console.log('  Detected Strategy:', parsed1.weightingStrategy);
  console.log('  Detected Max Weight Cap:', parsed1.maxWeightConstraint);
  console.log('  Detected Allocations:', parsed1.allocations.map(a => `${a.symbol}: ${a.weight}%`).join(', '));

  assert.strictEqual(parsed1.requestedAssetCount, 5, 'Should detect requested count of 5');
  assert.strictEqual(parsed1.weightingStrategy, 'EQUAL_WEIGHT', 'Should detect EQUAL_WEIGHT strategy');
  assert.strictEqual(parsed1.maxWeightConstraint, 0.25, 'Should detect 0.25 max weight cap');
  assert.strictEqual(parsed1.allocations.length, 5, 'Should produce exactly 5 allocations');
  parsed1.allocations.forEach(a => {
    assert.strictEqual(a.weight, 20.0, `Each allocation should be 20%, got ${a.weight} for ${a.symbol}`);
  });
  console.log('  [PASS] Test 1: Intent parsing strictly honored 5 assets, equal weight, and 25% cap.\n');

  // Test 2: Quant Engine with Equal Weighting Strategy
  console.log('[Test 2] Processing portfolio in Quant Engine with EQUAL_WEIGHT and 25% cap...');
  const mockPrices = {
    bAAPL: { price: 220, tradFiClosePriceUsd: 220, spreadPercent: 0.1, change24h: 1.2 },
    bMSFT: { price: 430, tradFiClosePriceUsd: 430, spreadPercent: 0.1, change24h: 0.8 },
    bNVDA: { price: 125, tradFiClosePriceUsd: 125, spreadPercent: 0.2, change24h: -1.5 },
    bAMZN: { price: 185, tradFiClosePriceUsd: 185, spreadPercent: 0.15, change24h: 0.5 },
    bTSLA: { price: 210, tradFiClosePriceUsd: 210, spreadPercent: 0.3, change24h: 2.1 }
  };

  const processed = await quantEngineService.processPortfolio(
    parsed1.allocations,
    mockPrices,
    100,
    {
      useMvpOptimizer: false,
      weightingStrategy: parsed1.weightingStrategy,
      maxWeight: parsed1.maxWeightConstraint,
      chainId: 97
    }
  );

  console.log('  Optimization Model:', processed.optimizationDiagnostics.optimizationModel);
  console.log('  Normalized Holdings:', processed.allocations.map(a => `${a.symbol}: ${a.weight}% ($${a.allocatedUsdt})`).join(', '));
  
  assert.strictEqual(processed.allocations.length, 5);
  processed.allocations.forEach(a => {
    assert.strictEqual(a.weight, 20.0, `Quant engine weight must be 20.0, got ${a.weight}`);
    assert.strictEqual(a.allocatedUsdt, 20.0, `Allocated USDT must be $20.0, got ${a.allocatedUsdt}`);
    assert.ok(a.weight <= 25.0, `Weight ${a.weight}% must not exceed 25% cap`);
  });

  const totalSum = processed.allocations.reduce((sum, a) => sum + a.weight, 0);
  assert.strictEqual(Math.round(totalSum), 100, 'Sum of weights must equal 100%');
  console.log('  [PASS] Test 2: Quant Engine preserved equal weights (20% each) and respected 25% ceiling.\n');

  // Test 3: Volatility Optimizer with dynamic maxWeight = 0.25 (when MVP is desired)
  console.log('[Test 3] Volatility Optimizer with maxWeight = 0.25 ceiling...');
  const symbols = ['bAAPL', 'bMSFT', 'bNVDA', 'bTSLA', 'bAMZN'];
  const vols = [0.22, 0.24, 0.48, 0.52, 0.32];
  const sigma = symbols.map((s1, i) => symbols.map((s2, j) => vols[i] * vols[j] * (i === j ? 1 : 0.6)));
  
  const mvpResult = volatilityOptimizer.optimize(symbols, sigma, {}, 0.05, 0.25);
  console.log('  MVP Allocations with 25% cap:');
  mvpResult.allocations.forEach(a => {
    console.log(`    ${a.symbol}: ${a.weight}%`);
    assert.ok(a.weight <= 25.01, `Asset ${a.symbol} weight (${a.weight}%) exceeded 25% cap!`);
    assert.ok(a.weight >= 4.99, `Asset ${a.symbol} weight (${a.weight}%) below 5% floor!`);
  });

  const mvpSum = mvpResult.allocations.reduce((sum, a) => sum + a.weight, 0);
  assert.strictEqual(Math.round(mvpSum), 100, 'MVP weights must sum to 100%');
  console.log('  [PASS] Test 3: Volatility optimizer strictly enforced 25% ceiling on all assets.\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

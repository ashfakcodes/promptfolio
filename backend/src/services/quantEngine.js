import { volatilityOptimizer } from './volatilityOptimizer.js';
import { marketDataIngestionService } from './marketDataIngestionService.js';
import { registryDiscoveryService } from './registryDiscoveryService.js';

export class QuantEngineService {
  /**
   * Normalize allocations and compute comprehensive ETF metrics,
   * optionally applying the Pure Volatility Minimization optimizer.
   */
  async processPortfolio(
    rawAllocations,
    livePrices,
    investmentAmount = 100,
    options = { useMvpOptimizer: true, explicitConstraints: {}, chainId: 97 }
  ) {
    if (!rawAllocations || rawAllocations.length === 0) {
      throw new Error('No allocations provided to Quant Engine');
    }

    const chainId = options.chainId || 97;
    const registry = await registryDiscoveryService.getActiveBStocks(chainId);
    const symbols = rawAllocations.map(a => a.symbol);

    // 1. Gather Market Snapshot & Covariance Matrix
    const marketSnapshot = await marketDataIngestionService.getMarketSnapshot(symbols, chainId);
    const sigma = marketDataIngestionService.buildCovarianceMatrix(symbols, marketSnapshot);

    let activeAllocations = rawAllocations;
    let mvpDiagnostics = null;

    const weightingStrategy = options.weightingStrategy || 'AUTO';
    const explicitConstraints = options.explicitConstraints || {};
    const n = symbols.length;

    // Bounds handling
    const rawMaxWeight = options.maxWeight !== undefined && options.maxWeight !== null ? Number(options.maxWeight) : 0.45;
    const rawMinWeight = options.minWeight !== undefined && options.minWeight !== null ? Number(options.minWeight) : 0.05;
    
    // Feasibility: n * maxWeight >= 1.0
    const maxWeight = Math.max(1.0 / (n || 1), rawMaxWeight);
    const minWeight = Math.min(maxWeight * 0.9, Math.max(0.01, rawMinWeight));

    // 2. Weighting Strategy Execution: Equal-Weight or Volatility Minimization (MVP)
    if (weightingStrategy === 'EQUAL_WEIGHT' && n > 0) {
      const fixedSymbols = Object.keys(explicitConstraints);
      const fixedWeightSum = Object.values(explicitConstraints).reduce((a, b) => a + Number(b), 0);
      const freeSymbols = symbols.filter(s => !fixedSymbols.some(fs => fs.toUpperCase() === s.toUpperCase()));
      const remainingWeight = Math.max(0, 100 - fixedWeightSum);
      const equalShare = freeSymbols.length > 0 ? Number((remainingWeight / freeSymbols.length).toFixed(1)) : 0;

      let curSum = 0;
      activeAllocations = symbols.map(sym => {
        const orig = rawAllocations.find(r => r.symbol.toUpperCase() === sym.toUpperCase()) || {};
        const isFixed = fixedSymbols.find(fs => fs.toUpperCase() === sym.toUpperCase());
        let w;
        if (isFixed) {
          w = Number(explicitConstraints[isFixed]);
        } else {
          const isLastFree = freeSymbols.length > 0 && freeSymbols[freeSymbols.length - 1].toUpperCase() === sym.toUpperCase();
          w = isLastFree ? Number((remainingWeight - curSum).toFixed(1)) : equalShare;
          curSum += equalShare;
        }
        return {
          symbol: sym,
          weight: w,
          role: orig.role
        };
      });

      // Benchmark diagnostics for equal-weighted portfolio
      const equalW = new Array(n).fill(1 / n);
      const equalVariance = volatilityOptimizer.calculateVariance(equalW, sigma);
      const equalVolatility = Number((Math.sqrt(Math.max(0, equalVariance)) * 100).toFixed(2));

      mvpDiagnostics = {
        optimizationModel: 'Equal-Weighted Portfolio (User Directive: 1/N Rule)',
        weightingStrategy: 'EQUAL_WEIGHT',
        maxWeightCap: options.maxWeight ? `${(Number(options.maxWeight) * 100).toFixed(1)}%` : 'Unconstrained',
        portfolioVolatility30d: equalVolatility,
        benchmarkEqualWeightVolatility30d: equalVolatility,
        volatilityReductionPercent: 0,
        portfolioVariance: Number(equalVariance.toFixed(6))
      };
    } else if (options.useMvpOptimizer && n > 1) {
      const optimization = volatilityOptimizer.optimize(
        symbols,
        sigma,
        explicitConstraints,
        minWeight,
        maxWeight
      );
      activeAllocations = optimization.allocations.map(opt => {
        const orig = rawAllocations.find(r => r.symbol.toUpperCase() === opt.symbol.toUpperCase()) || {};
        return {
          symbol: opt.symbol,
          weight: opt.weight,
          role: orig.role
        };
      });
      mvpDiagnostics = optimization.diagnostics;
    }

    // 3. Weight normalization verification (guarantee 100.0%)
    const totalWeight = activeAllocations.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
    let runningSum = 0;

    const normalized = activeAllocations.map((item, index) => {
      const isLast = index === activeAllocations.length - 1;
      let normWeight;
      if (isLast) {
        normWeight = Number((100 - runningSum).toFixed(2));
      } else {
        normWeight = Number(((item.weight / totalWeight) * 100).toFixed(2));
        runningSum += normWeight;
      }

      const stockMeta = registry.find(s => s.symbol.toUpperCase() === item.symbol.toUpperCase()) || {};
      const snapshotItem = marketSnapshot[item.symbol] || {};
      const priceData = livePrices[item.symbol] || {
        price: snapshotItem.currentPriceUsd || stockMeta.basePriceUsd || 100,
        tradFiClosePriceUsd: snapshotItem.tradFiClosePriceUsd || stockMeta.tradFiClosePriceUsd || 100,
        spreadPercent: snapshotItem.spreadPercent || 0,
        change24h: snapshotItem.change24h || 0
      };

      const allocatedUsdt = Number(((normWeight / 100) * investmentAmount).toFixed(2));
      const targetTokenUnits = Number((allocatedUsdt / priceData.price).toFixed(6));

      return {
        symbol: item.symbol,
        name: stockMeta.name || item.name || item.symbol,
        underlyingTicker: stockMeta.underlyingTicker || item.symbol.replace('b', ''),
        sector: stockMeta.sector || 'Equities',
        category: stockMeta.category || 'Big Tech',
        weight: normWeight,
        allocatedUsdt,
        targetTokenUnits,
        currentPriceUsd: priceData.price,
        tradFiClosePriceUsd: priceData.tradFiClosePriceUsd || stockMeta.tradFiClosePriceUsd,
        spreadPercent: priceData.spreadPercent || 0,
        change24h: priceData.change24h || 0,
        dividendYield: stockMeta.dividendYield || 0,
        beta: stockMeta.beta || 1.0,
        volatility30d: stockMeta.volatility30d || 25.0,
        riskLevel: stockMeta.riskLevel || 'MEDIUM',
        attestationProvider: stockMeta.attestationProvider || 'Binance RWA / On-Chain Custody',
        role: item.role || stockMeta.sector,
        contractAddress: stockMeta.contractAddress || stockMeta.chainAddresses?.[chainId] || null
      };
    });

    // 4. Compute composite metrics
    let compositeYield = 0;
    let compositeBeta = 0;
    let compositeVolatility = 0;
    let compositeOffHoursSpread = 0;

    normalized.forEach(item => {
      const fraction = item.weight / 100;
      compositeYield += item.dividendYield * fraction;
      compositeBeta += item.beta * fraction;
      compositeVolatility += item.volatility30d * fraction;
      compositeOffHoursSpread += item.spreadPercent * fraction;
    });

    // Realized portfolio volatility from covariance matrix
    const weightVector = normalized.map(i => i.weight / 100);
    const portfolioVariance = volatilityOptimizer.calculateVariance(weightVector, sigma);
    const portfolioVolatilityFromCov = Number((Math.sqrt(Math.max(0, portfolioVariance)) * 100).toFixed(2));

    // 5. Institutional risk scoring (1 - 10)
    let riskScore = 5;
    if (compositeBeta > 2.0) riskScore = 9;
    else if (compositeBeta > 1.4) riskScore = 7;
    else if (compositeBeta > 0.9) riskScore = 5;
    else if (compositeBeta > 0.3) riskScore = 3;
    else riskScore = 2;

    const hasTreasuries = normalized.some(item => item.symbol === 'bTBILL');
    if (hasTreasuries) {
      riskScore = Math.max(1, riskScore - 1);
    }

    return {
      investmentAmount: Number(investmentAmount),
      holdingsCount: normalized.length,
      allocations: normalized,
      optimizationDiagnostics: mvpDiagnostics || {
        optimizationModel: 'User Specified / Heuristic Allocations',
        portfolioVolatility30d: portfolioVolatilityFromCov
      },
      metrics: {
        compositeYieldApy: Number(compositeYield.toFixed(2)),
        compositeBeta: Number(compositeBeta.toFixed(2)),
        compositeVolatility30d: portfolioVolatilityFromCov || Number(compositeVolatility.toFixed(2)),
        compositeOffHoursSpread: Number(compositeOffHoursSpread.toFixed(2)),
        riskScore,
        riskLevel: this.getRiskLabel(riskScore),
        weekendTradingAdvantage: '24/7 Continuous Spot Pricing vs Friday TradFi Close'
      }
    };
  }

  getRiskLabel(score) {
    if (score >= 8) return 'VERY HIGH RISK / AGGRESSIVE';
    if (score >= 6) return 'HIGH GROWTH';
    if (score >= 4) return 'MODERATE / BALANCED';
    return 'CONSERVATIVE / CAPITAL PRESERVATION';
  }
}

export const quantEngineService = new QuantEngineService();

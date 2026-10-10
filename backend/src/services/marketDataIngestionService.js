import { dataFetcherService } from './dataFetcher.js';
import { registryDiscoveryService } from './registryDiscoveryService.js';

/**
 * Historical asset correlation baselines across sectors on BSC
 */
const SECTOR_CORRELATION_MATRIX = {
  'Artificial Intelligence': { 'Artificial Intelligence': 1.0, 'Big Tech': 0.78, 'Crypto Proxies': 0.65, 'Fixed Income & Hedging': -0.15 },
  'Big Tech': { 'Artificial Intelligence': 0.78, 'Big Tech': 1.0, 'Crypto Proxies': 0.58, 'Fixed Income & Hedging': -0.10 },
  'Crypto Proxies': { 'Artificial Intelligence': 0.65, 'Big Tech': 0.58, 'Crypto Proxies': 1.0, 'Fixed Income & Hedging': -0.25 },
  'Fixed Income & Hedging': { 'Artificial Intelligence': -0.15, 'Big Tech': -0.10, 'Crypto Proxies': -0.25, 'Fixed Income & Hedging': 1.0 },
  'Index Funds': { 'Artificial Intelligence': 0.85, 'Big Tech': 0.90, 'Crypto Proxies': 0.62, 'Fixed Income & Hedging': -0.05 },
  'Automotive & Energy': { 'Artificial Intelligence': 0.68, 'Big Tech': 0.62, 'Crypto Proxies': 0.55, 'Fixed Income & Hedging': -0.08 }
};

/**
 * Live Market & Macro Data Ingestion Service
 * Ingests DEX spot prices, TradFi Friday closing references, rolling 30-day volatilities,
 * and builds real-time covariance matrices for quant portfolio optimization.
 */
export class MarketDataIngestionService {
  /**
   * Fetch market metrics bundle for candidate bStocks
   */
  async getMarketSnapshot(symbols, chainId = 97) {
    const rawPrices = await dataFetcherService.getBatchPrices(symbols, chainId);
    const registry = await registryDiscoveryService.getActiveBStocks(chainId);

    const snapshot = {};
    for (const sym of symbols) {
      const stock = registry.find(s => s.symbol.toUpperCase() === sym.toUpperCase()) || {};
      const priceItem = rawPrices[sym] || {};

      const currentPrice = priceItem.price || stock.basePriceUsd || 100.0;
      const tradFiClose = stock.tradFiClosePriceUsd || currentPrice;
      const spreadPercent = Number((((currentPrice - tradFiClose) / tradFiClose) * 100).toFixed(2));

      snapshot[sym] = {
        symbol: sym,
        name: stock.name || sym,
        sector: stock.sector || 'Equities',
        category: stock.category || 'Big Tech',
        currentPriceUsd: currentPrice,
        tradFiClosePriceUsd: tradFiClose,
        spreadPercent,
        change24h: priceItem.change24h || 0,
        high24h: priceItem.high24h || currentPrice * 1.02,
        low24h: priceItem.low24h || currentPrice * 0.98,
        volatility30d: stock.volatility30d || 25.0,
        beta: stock.beta || 1.0,
        dividendYield: stock.dividendYield || 0.0,
        contractAddress: stock.contractAddress,
        source: priceItem.source || 'PancakeSwap V3 / Binance DEX'
      };
    }

    return snapshot;
  }

  /**
   * Build estimated pairwise Covariance Matrix (Sigma) for candidate assets
   * Sigma_ij = rho_ij * sigma_i * sigma_j + (i == j ? epsilon : 0)
   */
  buildCovarianceMatrix(symbols, marketSnapshot) {
    const n = symbols.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    const epsilon = 1e-5; // Diagonal Tikhonov regularization for mathematical Positive Semi-Definiteness

    for (let i = 0; i < n; i++) {
      const symA = symbols[i];
      const dataA = marketSnapshot[symA] || {};
      const volA = (dataA.volatility30d || 25.0) / 100; // Annualized/scaled standard deviation
      const sectorA = dataA.category || dataA.sector || 'Big Tech';

      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = (volA * volA) + epsilon; // Regularized Variance
        } else {
          const symB = symbols[j];
          const dataB = marketSnapshot[symB] || {};
          const volB = (dataB.volatility30d || 25.0) / 100;
          const sectorB = dataB.category || dataB.sector || 'Big Tech';

          // Lookup estimated correlation rho
          const rho = this.estimateCorrelation(symA, symB, sectorA, sectorB);
          matrix[i][j] = rho * volA * volB; // Covariance
        }
      }
    }

    return matrix;
  }

  /**
   * Estimate pairwise asset correlation rho in [-1.0, 1.0]
   */
  estimateCorrelation(symA, symB, sectorA, sectorB) {
    if (symA.toUpperCase() === symB.toUpperCase()) return 1.0;

    // US Treasury / Cash hedging has negative or low correlation to equities
    if (symA.toUpperCase() === 'BTBILL' || symB.toUpperCase() === 'BTBILL') {
      return -0.15;
    }

    // Same sector correlation
    if (sectorA === sectorB) {
      return 0.85;
    }

    // Lookup sector correlation table
    const tableA = SECTOR_CORRELATION_MATRIX[sectorA];
    if (tableA && tableA[sectorB] !== undefined) {
      return tableA[sectorB];
    }

    return 0.50; // Moderate positive baseline for equities
  }
}

export const marketDataIngestionService = new MarketDataIngestionService();

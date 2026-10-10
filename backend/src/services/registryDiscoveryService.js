import { ethers } from 'ethers';
import { BSTOCKS_CATALOG } from '../config/bstocksCatalog.js';
import { getNetwork } from '../config/network.js';
import { contractSecurityValidator } from './contractSecurityValidator.js';

const BSTOCKS_REGISTRY_ABI = [
  'function getActiveBStocks() external view returns (tuple(address tokenAddress, string symbol, string underlyingTicker, string name, string sector, uint8 decimals, bool isActive, address priceOracle, string attestationProvider, string attestationUri, uint256 registeredAt)[])',
  'function getBStock(string calldata symbol) external view returns (tuple(address tokenAddress, string symbol, string underlyingTicker, string name, string sector, uint8 decimals, bool isActive, address priceOracle, string attestationProvider, string attestationUri, uint256 registeredAt))',
  'function isVerified(address token) external view returns (bool)',
  'function totalSymbols() external view returns (uint256)'
];

/**
 * Registry & Discovery Service
 * Bridges on-chain BStocksRegistry smart contract on BSC with the dynamic in-memory catalog,
 * ensuring verified attestation, security checks, and real-time asset discovery.
 */
export class RegistryDiscoveryService {
  constructor() {
    // Dynamic registry storage (keyed by chainId)
    this.chainRegistries = new Map();
    this.lastSyncTimestamps = new Map();
    this.syncIntervalMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get all active verified bStocks for a given chain
   */
  async getActiveBStocks(chainId = 97) {
    await this.ensureSynced(chainId);
    const registry = this.chainRegistries.get(chainId) || [];
    return registry;
  }

  /**
   * Find bStock by ticker, symbol, name, or sector tags
   */
  async findBStock(query, chainId = 97) {
    if (!query) return null;
    const q = query.trim().toLowerCase();
    const stocks = await this.getActiveBStocks(chainId);

    // Exact match on symbol / underlying / aliases
    let match = stocks.find(
      s => s.symbol.toLowerCase() === q ||
           s.underlyingTicker?.toLowerCase() === q ||
           s.symbol.toLowerCase() === `b${q}` ||
           s.symbol.toLowerCase() === `${q}b` ||
           s.name?.toLowerCase() === q ||
           (s.aliases && s.aliases.some(a => a.toLowerCase() === q))
    );
    if (match) return match;

    const cleanQ = q.startsWith('b') ? q.substring(1) : (q.endsWith('b') ? q.slice(0, -1) : q);
    match = stocks.find(
      s => s.underlyingTicker?.toLowerCase() === cleanQ ||
           s.symbol.toLowerCase().replace(/^b/, '').replace(/b$/, '') === cleanQ ||
           (s.aliases && s.aliases.some(a => a.toLowerCase().replace(/^b/, '').replace(/b$/, '') === cleanQ))
    );
    if (match) return match;

    // Substring / tag search
    match = stocks.find(s => {
      const tags = s.tags || [];
      const inTags = tags.some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q));
      const inSector = s.sector?.toLowerCase().includes(q);
      const inDesc = s.description?.toLowerCase().includes(q);
      return inTags || inSector || inDesc;
    });

    return match || null;
  }

  /**
   * Sync on-chain BStocksRegistry with in-memory universe and verified base catalog
   */
  async syncRegistry(chainId = 97) {
    const network = getNetwork(chainId);
    const registryAddress = network.contracts?.bstocksRegistry;
    const rpcUrl = network.rpcUrls?.[0] || network.rpcUrl;

    const mergedMap = new Map();

    // 1. Seed with verified baseline bStocks catalog
    BSTOCKS_CATALOG.forEach(stock => {
      const address = stock.chainAddresses?.[chainId] || stock.chainAddresses?.[97];
      mergedMap.set(stock.symbol.toUpperCase(), {
        ...stock,
        contractAddress: address,
        tokenAddress: address,
        source: 'Curated Verified bStocks Registry',
        isVerified: true
      });
    });

    // 2. Query on-chain BStocksRegistry contract if deployed and configured
    if (registryAddress && registryAddress !== ethers.ZeroAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(registryAddress, BSTOCKS_REGISTRY_ABI, provider);
        const onChainStocks = await contract.getActiveBStocks();

        for (const item of onChainStocks) {
          const sym = item.symbol.toUpperCase();
          const existing = mergedMap.get(sym) || {};
          mergedMap.set(sym, {
            ...existing,
            symbol: item.symbol,
            name: item.name || existing.name,
            underlyingTicker: item.underlyingTicker || existing.underlyingTicker,
            sector: item.sector || existing.sector,
            contractAddress: item.tokenAddress,
            tokenAddress: item.tokenAddress,
            decimals: Number(item.decimals || 18),
            attestationProvider: item.attestationProvider || existing.attestationProvider,
            attestationUri: item.attestationUri || existing.attestationUri,
            registeredAt: Number(item.registeredAt || 0),
            source: 'BStocksRegistry.sol (On-Chain)',
            isVerified: true
          });
        }
        console.log(`[RegistryDiscovery] Successfully synchronized ${onChainStocks.length} on-chain bStocks from ${registryAddress} on chain ${chainId}`);
      } catch (err) {
        console.warn(`[RegistryDiscovery] On-chain registry query notice for chain ${chainId}:`, err.message);
      }
    }

    // 3. Run security validation across all active tokens
    const stockList = Array.from(mergedMap.values());
    const validatedList = [];

    for (const stock of stockList) {
      const sec = await contractSecurityValidator.validateToken(stock.contractAddress, chainId);
      if (sec.safe) {
        validatedList.push({
          ...stock,
          securityValidation: sec
        });
      } else {
        console.warn(`[RegistryDiscovery] Flagged unsafe token rejected from catalog: ${stock.symbol} (${sec.reason})`);
      }
    }

    this.chainRegistries.set(chainId, validatedList);
    this.lastSyncTimestamps.set(chainId, Date.now());
    return validatedList;
  }

  /**
   * Dynamically register or propose a newly discovered bStock
   */
  async registerDynamicBStock(stockData, chainId = 97) {
    if (!stockData.symbol || !stockData.contractAddress) {
      throw new Error('Stock registration requires valid symbol and contractAddress');
    }

    const upperSymbol = stockData.symbol.toUpperCase();
    // Protect core curated catalog against symbol squatting / overwriting
    const isCurated = BSTOCKS_CATALOG.some(s => s.symbol.toUpperCase() === upperSymbol);
    if (isCurated) {
      throw new Error(`Symbol ${upperSymbol} is a protected core bStock and cannot be dynamically overwritten.`);
    }

    const sec = await contractSecurityValidator.validateToken(stockData.contractAddress, chainId);
    if (!sec.safe) {
      throw new Error(`Security validation failed: ${sec.reason || 'Untrusted token contract'}`);
    }

    const registry = await this.getActiveBStocks(chainId);
    const existingIndex = registry.findIndex(s => s.symbol.toUpperCase() === upperSymbol);

    const entry = {
      ...stockData,
      symbol: upperSymbol,
      decimals: stockData.decimals || 18,
      source: 'Autonomous Discovery Engine',
      isVerified: true,
      securityValidation: sec,
      discoveredAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      registry[existingIndex] = { ...registry[existingIndex], ...entry };
    } else {
      registry.push(entry);
    }

    this.chainRegistries.set(chainId, registry);
    return entry;
  }

  /**
   * Internal sync check helper
   */
  async ensureSynced(chainId = 97) {
    const lastSync = this.lastSyncTimestamps.get(chainId) || 0;
    if (Date.now() - lastSync > this.syncIntervalMs || !this.chainRegistries.has(chainId)) {
      await this.syncRegistry(chainId);
    }
  }
}

export const registryDiscoveryService = new RegistryDiscoveryService();

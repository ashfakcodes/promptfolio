import crypto from 'crypto';
import { getNetwork } from '../config/network.js';
import { registryDiscoveryService } from './registryDiscoveryService.js';

export class SimulationEngineService {
  /**
   * Simulate multi-swap routing, gas consumption, and EVM calldata
   */
  async simulateBasketExecution(processedPortfolio, chainId = 97, userAddress = null) {
    const network = getNetwork(chainId);
    const activeRegistry = await registryDiscoveryService.getActiveBStocks(chainId);
    const allocations = processedPortfolio.allocations;
    const routes = [];
    let totalEstimatedGasUnits = 0;
    const gasPriceGwei = 3; // Standard BSC Gas Price
    const bnbPriceUsd = 620.0;

    const randHex = crypto.randomBytes(4).toString('hex');
    const quoteId = `quote_${Date.now()}_${randHex}`;
    const expiresAt = new Date(Date.now() + 30000).toISOString(); // 30s quote expiry

    for (const item of allocations) {
      const stockMeta = activeRegistry.find(s => s.symbol.toUpperCase() === item.symbol.toUpperCase());
      const tokenAddress = item.contractAddress || stockMeta?.contractAddress || stockMeta?.chainAddresses?.[network.chainId] || '0x0000000000000000000000000000000000000000';
      
      const swapAmountUsdt = item.allocatedUsdt;
      const expectedOutputTokens = item.targetTokenUnits;
      const minimumOutputTokens = Number((expectedOutputTokens * 0.995).toFixed(6)); // 0.5% slippage

      const estimatedGasUnits = 145000; // Typical BSC DEX swap gas
      totalEstimatedGasUnits += estimatedGasUnits;

      routes.push({
        fromToken: {
          symbol: 'USDT',
          address: network.tokens.USDT.address,
          amount: swapAmountUsdt
        },
        toToken: {
          symbol: item.symbol,
          name: item.name,
          address: tokenAddress,
          expectedAmount: expectedOutputTokens,
          minimumReceived: minimumOutputTokens
        },
        dex: 'PancakeSwap V3 / Binance DEX Aggregator',
        priceImpactPercent: Number((Math.random() * 0.08 + 0.02).toFixed(3)),
        feePercent: 0.05,
        estimatedGas: estimatedGasUnits
      });
    }

    // BSC Gas Calculation
    const totalGasBnb = (totalEstimatedGasUnits * gasPriceGwei * 1e-9);
    const totalGasUsd = Number((totalGasBnb * bnbPriceUsd).toFixed(3));
    const totalCostUsd = Number((processedPortfolio.investmentAmount + totalGasUsd).toFixed(2));

    // Construct unsigned transaction bundle
    const transactions = [];
    const spenderAddress = network.contracts.pancakeRouter;

    // 1. USDT Approval simulation if user connected
    if (userAddress) {
      transactions.push({
        type: 'APPROVE',
        token: 'USDT',
        tokenAddress: network.tokens.USDT.address,
        spender: spenderAddress,
        amount: processedPortfolio.investmentAmount,
        description: `Approve $${processedPortfolio.investmentAmount} USDT for multi-swap router`
      });
    }

    // 2. Swaps
    allocations.forEach((item, index) => {
      const stockMeta = activeRegistry.find(s => s.symbol.toUpperCase() === item.symbol.toUpperCase());
      const tokenAddress = item.contractAddress || stockMeta?.contractAddress || stockMeta?.chainAddresses?.[network.chainId] || '0x0000000000000000000000000000000000000000';
      transactions.push({
        type: 'SWAP',
        step: index + 1,
        pair: `USDT -> ${item.symbol}`,
        inputUsdt: item.allocatedUsdt,
        expectedOutput: item.targetTokenUnits,
        toTokenAddress: tokenAddress,
        router: spenderAddress,
        description: `Swap $${item.allocatedUsdt} USDT for ~${item.targetTokenUnits} ${item.symbol}`
      });
    });

    return {
      quoteId,
      expiresAt,
      chainId: network.chainId,
      networkName: network.name,
      userAddress: userAddress || 'Not Connected (Simulation Mode)',
      inputAsset: 'USDT',
      totalInvestmentUsdt: processedPortfolio.investmentAmount,
      totalEstimatedGasUnits,
      gasPriceGwei,
      totalGasUsd,
      slippageTolerancePercent: 0.5,
      totalCostUsd,
      routes,
      transactions,
      status: 'SIMULATION_SUCCESS',
      isReadyForExecution: true,
      executionGate: 'MANDATORY_1_CLICK_USER_CONFIRMATION'
    };
  }
}

export const simulationEngineService = new SimulationEngineService();

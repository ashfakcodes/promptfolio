export const NETWORKS = {
  97: {
    chainId: 97,
    hexChainId: '0x61',
    name: 'BNB Smart Chain Testnet',
    shortName: 'BSC Testnet',
    rpcUrl: process.env.BSC_TESTNET_RPC || 'https://bsc-testnet.publicnode.com',
    rpcUrls: [
      process.env.BSC_TESTNET_RPC,
      'https://bsc-testnet.publicnode.com',
      'https://bsc-testnet-dataseed.bnbchain.org',
      'https://bnb-testnet.api.onfinality.io/public',
      'https://bsc-testnet.drpc.org'
    ].filter(Boolean),
    blockExplorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: {
      name: 'Test BNB',
      symbol: 'tBNB',
      decimals: 18,
    },
    tokens: {
      USDT: {
        address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
        symbol: 'USDT',
        decimals: 18,
        name: 'Tether USD (Testnet)'
      },
      WBNB: {
        address: '0xae13d989daC2f0dEBff460aC112a837C89BAa7cd',
        symbol: 'WBNB',
        decimals: 18,
        name: 'Wrapped BNB'
      }
    },
    contracts: {
      pancakeRouter: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
      basketRouter: '0x0000000000000000000000000000000000000000'
    }
  },
  56: {
    chainId: 56,
    hexChainId: '0x38',
    name: 'BNB Smart Chain Mainnet',
    shortName: 'BSC Mainnet',
    rpcUrl: process.env.BSC_MAINNET_RPC || 'https://bsc-dataseed.binance.org',
    rpcUrls: [
      process.env.BSC_MAINNET_RPC,
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://1rpc.io/bnb'
    ].filter(Boolean),
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    tokens: {
      USDT: {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        decimals: 18,
        name: 'Tether USD'
      },
      WBNB: {
        address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        symbol: 'WBNB',
        decimals: 18,
        name: 'Wrapped BNB'
      }
    },
    contracts: {
      pancakeRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      basketRouter: '0x0000000000000000000000000000000000000000'
    }
  }
};

export const DEFAULT_CHAIN_ID = 97;

export function getNetwork(chainId = DEFAULT_CHAIN_ID) {
  const numericId = Number(chainId);
  return NETWORKS[numericId] || NETWORKS[DEFAULT_CHAIN_ID];
}

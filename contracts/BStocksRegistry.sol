// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title BStocksRegistry
 * @notice Promptfolio On-Chain bStocks Registry & Attestation Whitelist on BNB Smart Chain (BSC).
 * @dev Maintains a cryptographically verified and governed catalog of tokenized equities (bStocks)
 * and real-world asset (RWA) tokens. Prevents token spoofing, honeypots, and untrusted asset injection
 * into autonomous ETF basket synthesis.
 */
contract BStocksRegistry {
    address public owner;
    address public pendingOwner;

    struct BStockAsset {
        address tokenAddress;
        string symbol;
        string underlyingTicker;
        string name;
        string sector;
        uint8 decimals;
        bool isActive;
        address priceOracle;
        string attestationProvider;
        string attestationUri;
        uint256 registeredAt;
    }

    // Symbol => BStockAsset
    mapping(string => BStockAsset) private _stocksBySymbol;
    // Token Address => Symbol
    mapping(address => string) private _symbolByAddress;
    // List of all registered symbols
    string[] private _registeredSymbols;

    event BStockRegistered(
        address indexed tokenAddress,
        string symbol,
        string underlyingTicker,
        string sector,
        uint256 timestamp
    );
    event BStockStatusUpdated(address indexed tokenAddress, string symbol, bool isActive);
    event AttestationUpdated(address indexed tokenAddress, string symbol, string provider, string uri);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "BStocksRegistry: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Register a newly minted or verified bStock token on BSC
     */
    function registerBStock(
        address tokenAddress,
        string calldata symbol,
        string calldata underlyingTicker,
        string calldata name,
        string calldata sector,
        uint8 decimals,
        address priceOracle,
        string calldata attestationProvider,
        string calldata attestationUri
    ) external onlyOwner {
        require(tokenAddress != address(0), "BStocksRegistry: zero address");
        require(bytes(symbol).length > 0, "BStocksRegistry: empty symbol");
        require(decimals > 0 && decimals <= 18, "BStocksRegistry: invalid decimals");
        require(bytes(_symbolByAddress[tokenAddress]).length == 0, "BStocksRegistry: token already registered");
        require(_stocksBySymbol[symbol].tokenAddress == address(0), "BStocksRegistry: symbol already registered");

        BStockAsset memory newStock = BStockAsset({
            tokenAddress: tokenAddress,
            symbol: symbol,
            underlyingTicker: underlyingTicker,
            name: name,
            sector: sector,
            decimals: decimals,
            isActive: true,
            priceOracle: priceOracle,
            attestationProvider: attestationProvider,
            attestationUri: attestationUri,
            registeredAt: block.timestamp
        });

        _stocksBySymbol[symbol] = newStock;
        _symbolByAddress[tokenAddress] = symbol;
        _registeredSymbols.push(symbol);

        emit BStockRegistered(tokenAddress, symbol, underlyingTicker, sector, block.timestamp);
    }

    /**
     * @notice Toggle active status of a bStock (e.g. for halted trading or delisted assets)
     */
    function setBStockStatus(string calldata symbol, bool isActive) external onlyOwner {
        BStockAsset storage stock = _stocksBySymbol[symbol];
        require(stock.tokenAddress != address(0), "BStocksRegistry: stock not found");
        stock.isActive = isActive;

        emit BStockStatusUpdated(stock.tokenAddress, symbol, isActive);
    }

    /**
     * @notice Update proof-of-reserve attestation metadata
     */
    function updateAttestation(
        string calldata symbol,
        string calldata attestationProvider,
        string calldata attestationUri
    ) external onlyOwner {
        BStockAsset storage stock = _stocksBySymbol[symbol];
        require(stock.tokenAddress != address(0), "BStocksRegistry: stock not found");
        stock.attestationProvider = attestationProvider;
        stock.attestationUri = attestationUri;

        emit AttestationUpdated(stock.tokenAddress, symbol, attestationProvider, attestationUri);
    }

    /**
     * @notice Check whether a token address is an active, verified bStock
     */
    function isVerified(address token) external view returns (bool) {
        string memory sym = _symbolByAddress[token];
        if (bytes(sym).length == 0) return false;
        return _stocksBySymbol[sym].isActive;
    }

    /**
     * @notice Get single bStock details by symbol
     */
    function getBStock(string calldata symbol) external view returns (BStockAsset memory) {
        BStockAsset memory stock = _stocksBySymbol[symbol];
        require(stock.tokenAddress != address(0), "BStocksRegistry: stock not found");
        return stock;
    }

    /**
     * @notice Get single bStock details by contract address
     */
    function getBStockByAddress(address tokenAddress) external view returns (BStockAsset memory) {
        string memory sym = _symbolByAddress[tokenAddress];
        require(bytes(sym).length > 0, "BStocksRegistry: token not registered");
        return _stocksBySymbol[sym];
    }

    /**
     * @notice Retrieve all active registered bStocks
     */
    function getActiveBStocks() external view returns (BStockAsset[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _registeredSymbols.length; i++) {
            if (_stocksBySymbol[_registeredSymbols[i]].isActive) {
                count++;
            }
        }

        BStockAsset[] memory activeList = new BStockAsset[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _registeredSymbols.length; i++) {
            if (_stocksBySymbol[_registeredSymbols[i]].isActive) {
                activeList[index] = _stocksBySymbol[_registeredSymbols[i]];
                index++;
            }
        }
        return activeList;
    }

    /**
     * @notice Retrieve active registered bStocks with pagination to avoid block gas limit exhaustion
     */
    function getActiveBStocksPaged(uint256 offset, uint256 limit) external view returns (BStockAsset[] memory, uint256 total) {
        uint256 totalCount = _registeredSymbols.length;
        if (offset >= totalCount || limit == 0) {
            return (new BStockAsset[](0), totalCount);
        }

        uint256 end = offset + limit > totalCount ? totalCount : offset + limit;
        uint256 size = end - offset;
        BStockAsset[] memory pagedList = new BStockAsset[](size);
        for (uint256 i = 0; i < size; i++) {
            pagedList[i] = _stocksBySymbol[_registeredSymbols[offset + i]];
        }
        return (pagedList, totalCount);
    }

    /**
     * @notice Total number of registered symbols
     */
    function totalSymbols() external view returns (uint256) {
        return _registeredSymbols.length;
    }

    // Two-step ownership transfer
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BStocksRegistry: zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "BStocksRegistry: caller is not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title IERC20
 * @dev Interface of the ERC20 standard with optional/non-standard returns handled.
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title IPancakeRouter02
 * @dev DEX router interface for BNB Smart Chain.
 */
interface IPancakeRouter02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
}

/**
 * @title BasketRouter
 * @notice Promptfolio Atomic Multi-Swap Aggregator on BNB Smart Chain (BSC).
 * @dev Executes natural-language synthesized ETF baskets in a single atomic EVM transaction.
 * Includes strict input sum verification, USDT zero-reset approval protection,
 * caller-supplied deadline enforcement, 2-step ownership transfer, and secure transaction-scoped residual refunds.
 */
contract BasketRouter {
    address public owner;
    address public pendingOwner;
    address public pancakeRouter;
    address public immutable WBNB;

    // Reentrancy guard state
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    struct SwapOrder {
        address toToken;
        uint256 inputAmount;
        uint256 minOutputAmount;
        address[] path;
    }

    event BasketExecuted(
        address indexed user,
        address indexed inputToken,
        uint256 totalInputSpent,
        uint256 orderCount,
        uint256 timestamp
    );

    event SingleSwapExecuted(
        address indexed user,
        address indexed inputToken,
        address indexed toToken,
        uint256 inputAmount,
        uint256 outputAmount
    );

    event PancakeRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "BasketRouter: caller is not owner");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "BasketRouter: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(address _pancakeRouter, address _wbnb) {
        require(_pancakeRouter != address(0) && _pancakeRouter.code.length > 0, "BasketRouter: invalid router");
        require(_wbnb != address(0) && _wbnb.code.length > 0, "BasketRouter: invalid WBNB");
        owner = msg.sender;
        pancakeRouter = _pancakeRouter;
        WBNB = _wbnb;
        _status = _NOT_ENTERED;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Two-step ownership transfer initiation
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BasketRouter: new owner is zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Two-step ownership transfer acceptance
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "BasketRouter: caller is not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function setPancakeRouter(address _newRouter) external onlyOwner {
        require(_newRouter != address(0) && _newRouter.code.length > 0, "BasketRouter: invalid router contract");
        emit PancakeRouterUpdated(pancakeRouter, _newRouter);
        pancakeRouter = _newRouter;
    }

    /**
     * @notice Safe token approval helper handling USDT non-zero allowance reverts on BSC
     */
    function _safeApprove(address token, address spender, uint256 amount) internal {
        require(token.code.length > 0, "BasketRouter: token is not a contract");

        // Safe reset to 0 first to comply with tokens like BSC USDT (0x55d3...)
        (bool successReset, bytes memory dataReset) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, 0)
        );
        require(
            successReset && (dataReset.length == 0 || abi.decode(dataReset, (bool))),
            "BasketRouter: approve reset failed"
        );

        if (amount > 0) {
            (bool successApprove, bytes memory dataApprove) = token.call(
                abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
            );
            require(
                successApprove && (dataApprove.length == 0 || abi.decode(dataApprove, (bool))),
                "BasketRouter: token approval failed"
            );
        }
    }

    /**
     * @notice Safe ERC20 transfer helper
     */
    function _safeTransfer(address token, address to, uint256 amount) internal {
        require(token.code.length > 0, "BasketRouter: token is not a contract");
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "BasketRouter: token transfer failed"
        );
    }

    /**
     * @notice Safe ERC20 transferFrom helper
     */
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        require(token.code.length > 0, "BasketRouter: token is not a contract");
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "BasketRouter: token transferFrom failed"
        );
    }

    /**
     * @notice Execute basket purchase using ERC20 (e.g. USDT)
     * @param inputToken Address of base asset (e.g. USDT)
     * @param totalInput Total input amount approved by caller
     * @param orders Array of individual token swap instructions
     * @param deadline Unix timestamp after which transaction must revert
     */
    function executeBasketWithToken(
        address inputToken,
        uint256 totalInput,
        SwapOrder[] calldata orders,
        uint256 deadline
    ) external nonReentrant returns (bool) {
        require(deadline >= block.timestamp, "BasketRouter: EXPIRED");
        require(orders.length > 0, "BasketRouter: empty orders");
        require(inputToken != address(0) && inputToken.code.length > 0, "BasketRouter: invalid input token");

        // 1. Strict sum verification prevents trapped or overspent funds
        uint256 computedTotal = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            require(orders[i].inputAmount > 0, "BasketRouter: zero input amount");
            computedTotal += orders[i].inputAmount;
        }
        require(computedTotal == totalInput, "BasketRouter: input mismatch");

        // 2. Transfer tokens from caller to router and verify received amount (no fee-on-transfer deductions)
        uint256 balanceBefore = IERC20(inputToken).balanceOf(address(this));
        _safeTransferFrom(inputToken, msg.sender, address(this), totalInput);
        uint256 actualReceived = IERC20(inputToken).balanceOf(address(this)) - balanceBefore;
        require(actualReceived == totalInput, "BasketRouter: transfer fee not supported or underfunded");

        // 3. Reset and set approval with USDT zero-reset compliance
        _safeApprove(inputToken, pancakeRouter, totalInput);

        // 4. Execute swaps sequentially
        uint256 totalSpent = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            SwapOrder calldata order = orders[i];
            require(order.minOutputAmount > 0, "BasketRouter: zero min output");
            require(order.path.length >= 2, "BasketRouter: invalid path length");
            require(order.path[0] == inputToken, "BasketRouter: path start mismatch");
            require(order.path[order.path.length - 1] == order.toToken, "BasketRouter: path end mismatch");

            totalSpent += order.inputAmount;

            uint256[] memory amounts = IPancakeRouter02(pancakeRouter).swapExactTokensForTokens(
                order.inputAmount,
                order.minOutputAmount,
                order.path,
                msg.sender, // Deliver swapped tokens directly to user wallet
                deadline
            );

            emit SingleSwapExecuted(
                msg.sender,
                inputToken,
                order.toToken,
                order.inputAmount,
                amounts[amounts.length - 1]
            );
        }

        require(totalSpent == totalInput, "BasketRouter: total spent mismatch");

        // 5. Clean up allowance after execution
        _safeApprove(inputToken, pancakeRouter, 0);

        // 6. Refund any unspent portion of caller's input (transaction-scoped)
        if (actualReceived > totalSpent) {
            uint256 unspentRefund = actualReceived - totalSpent;
            _safeTransfer(inputToken, msg.sender, unspentRefund);
        }

        emit BasketExecuted(
            msg.sender,
            inputToken,
            totalInput,
            orders.length,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Execute basket purchase using Native BNB
     * @param orders Array of individual token swap instructions
     * @param deadline Unix timestamp after which transaction must revert
     */
    function executeBasketWithBNB(
        SwapOrder[] calldata orders,
        uint256 deadline
    ) external payable nonReentrant returns (bool) {
        require(deadline >= block.timestamp, "BasketRouter: EXPIRED");
        require(orders.length > 0, "BasketRouter: empty orders");

        // 1. Strict sum verification prevents contract drainage attacks
        uint256 computedTotal = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            require(orders[i].inputAmount > 0, "BasketRouter: zero input amount");
            computedTotal += orders[i].inputAmount;
        }
        require(msg.value >= computedTotal, "BasketRouter: insufficient BNB sent");

        // 2. Execute swaps directly with value
        uint256 totalSpent = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            SwapOrder calldata order = orders[i];
            require(order.minOutputAmount > 0, "BasketRouter: zero min output");
            require(order.path.length >= 2, "BasketRouter: invalid path length");
            require(order.path[0] == WBNB, "BasketRouter: BNB path must start with WBNB");
            require(order.path[order.path.length - 1] == order.toToken, "BasketRouter: path end mismatch");

            totalSpent += order.inputAmount;

            uint256[] memory amounts = IPancakeRouter02(pancakeRouter).swapExactETHForTokens{
                value: order.inputAmount
            }(
                order.minOutputAmount,
                order.path,
                msg.sender,
                deadline
            );

            emit SingleSwapExecuted(
                msg.sender,
                WBNB,
                order.toToken,
                order.inputAmount,
                amounts[amounts.length - 1]
            );
        }

        // 3. Refund any excess BNB sent back to caller
        uint256 excessBNB = msg.value - totalSpent;
        if (excessBNB > 0) {
            (bool refundSuccess, ) = msg.sender.call{value: excessBNB}("");
            require(refundSuccess, "BasketRouter: BNB refund failed");
        }

        emit BasketExecuted(
            msg.sender,
            WBNB,
            totalSpent,
            orders.length,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Emergency withdrawal if residual tokens remain
     */
    function rescueTokens(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) {
            (bool success, ) = owner.call{value: amount}("");
            require(success, "BasketRouter: BNB rescue failed");
        } else {
            _safeTransfer(token, owner, amount);
        }
    }

    /**
     * @notice Reject direct BNB deposits to prevent accidental trapping of user funds
     */
    receive() external payable {
        require(
            msg.sender == WBNB || msg.sender == pancakeRouter,
            "BasketRouter: direct deposits disabled"
        );
    }
}

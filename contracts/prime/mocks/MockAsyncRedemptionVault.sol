// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAsyncRedemptionVault
 * @notice A specialized mock vault that implements an asynchronous requestRedeem function.
 */
contract MockAsyncRedemptionVault is ERC4626 {
    uint256 private _nextRequestId;
    mapping(uint256 => uint256) private _requestIdToAmount;
    mapping(uint256 => address) private _requestIdToReceiver;

    constructor(address asset, string memory name, string memory symbol) ERC4626(IERC20(asset)) ERC20(name, symbol) {
        _nextRequestId = 1;
    }

    /**
     * @notice Simulates requesting a redemption.
     * @dev Burns shares and stores request data. Returns nothing to match production external vaults.
     */
    function requestRedeem(uint256 shares) public {
        uint256 assets = previewRedeem(shares);
        _burn(msg.sender, shares);

        uint256 requestId = _nextRequestId++;
        _requestIdToAmount[requestId] = assets;
        _requestIdToReceiver[requestId] = msg.sender;
    }

    // Simple 1:1 implementation for testing
    function _convertToShares(uint256 assets, Math.Rounding) internal view override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding) internal view override returns (uint256) {
        return shares;
    }
}

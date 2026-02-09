// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol"; // NEW

contract MockERC4626 is ERC4626 {
    using SafeERC20 for IERC20; // NEW
    uint256 private _nextRequestId;
    mapping(uint256 => uint256) private _requestIdToAmount;
    mapping(uint256 => address) private _requestIdToReceiver;
    constructor(address asset, string memory name, string memory symbol) ERC4626(IERC20(asset)) ERC20(name, symbol) {
        _nextRequestId = 1;
    }

    function requestRedeem(uint256 shares, address receiver, address owner) public returns (uint256 assets, uint256 requestId) {
        assets = previewRedeem(shares); // Calculate the assets to be received
        _burn(owner, shares); // Burn shares from the owner

        // Store the redemption request
        requestId = _nextRequestId;
        _nextRequestId++;
        _requestIdToAmount[requestId] = assets;
        _requestIdToReceiver[requestId] = receiver;
        // No actual transfer of assets happens here, it's a request
    }

    // Simple 1:1 implementation for testing
    function _convertToShares(uint256 assets, Math.Rounding) internal view override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding) internal view override returns (uint256) {
        return shares;
    }

}

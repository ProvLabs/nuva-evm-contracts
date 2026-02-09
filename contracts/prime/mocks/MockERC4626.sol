// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC4626
 * @notice A standard ERC4626 mock vault for testing.
 */
contract MockERC4626 is ERC4626 {
    constructor(address asset, string memory name, string memory symbol) ERC4626(IERC20(asset)) ERC20(name, symbol) {}

    // Simple 1:1 implementation for testing
    function _convertToShares(uint256 assets, Math.Rounding) internal view override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding) internal view override returns (uint256) {
        return shares;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockERC4626
 * @notice A standard ERC4626 mock vault with Permit support for testing.
 */
contract MockERC4626 is ERC4626, ERC20Permit {
    constructor(
        address asset,
        string memory name,
        string memory symbol
    ) ERC4626(IERC20(asset)) ERC20(name, symbol) ERC20Permit(name) {}

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * @return The number of decimals.
     */
    function decimals() public view virtual override(ERC4626, ERC20) returns (uint8) {
        return super.decimals();
    }

    // Simple 1:1 implementation for testing
    function _convertToShares(uint256 assets, Math.Rounding) internal pure override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding) internal pure override returns (uint256) {
        return shares;
    }
}

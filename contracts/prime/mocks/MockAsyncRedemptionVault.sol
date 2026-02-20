// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockAsyncRedemptionVault
 * @notice A specialized mock vault that implements an asynchronous requestRedeem function with Permit support.
 */
contract MockAsyncRedemptionVault is ERC4626, ERC20Permit {

    constructor(
        address asset,
        string memory name,
        string memory symbol
    ) ERC4626(IERC20(asset)) ERC20(name, symbol) ERC20Permit(name) {
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * @return The number of decimals.
     */
    function decimals() public view virtual override(ERC4626, ERC20) returns (uint8) {
        return super.decimals();
    }

    /**
     * @notice Simulates requesting a redemption.
     * @dev Burns shares and stores request data. Returns nothing to match production external vaults.
     * @param shares The amount of shares to redeem.
     */
    function requestRedeem(uint256 shares) public {
        // uint256 assets = previewRedeem(shares);
        _burn(msg.sender, shares);
    }

    // Simple 1:1 implementation for testing
    function _convertToShares(uint256 assets, Math.Rounding) internal pure override returns (uint256) {
        return assets;
    }

    function _convertToAssets(uint256 shares, Math.Rounding) internal pure override returns (uint256) {
        return shares;
    }
}

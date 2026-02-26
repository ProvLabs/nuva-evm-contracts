// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainVault} from "../CrossChainVault.sol";

/// @title CrossChainVaultHarness
/// @notice A harness contract for testing the CrossChainVault contract
/// @author NU Blockchain Technologies
contract CrossChainVaultHarness is CrossChainVault {
    /// @notice Exposes the internal function `getBalance` as public
    /// @param token The address of the token to get the balance for
    /// @return The balance of the specified token for this contract
    function exposeGetBalance(address token) public view returns (uint256) {
        return getBalance(token);
    }

    /// @notice Exposes the internal function `normalizeAmount` as public
    /// @param amount The amount to normalize
    /// @param decimals The number of decimals
    /// @return The normalized amount
    function exposeNormalizeAmount(uint256 amount, uint8 decimals) public pure returns (uint256) {
        return normalizeAmount(amount, decimals);
    }
}
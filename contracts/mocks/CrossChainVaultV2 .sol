// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../CrossChainVault.sol";

/**
 * @title CrossChainVaultV2
 * @notice Mock version of CrossChainVault for testing upgradeability.
 */
contract CrossChainVaultV2 is CrossChainVault {
    bool public version2FunctionalityEnabled;

    /**
     * @notice A new function introduced in V2.
     */
    function enableVersion2Functionality() external {
        version2FunctionalityEnabled = true;
    }

    /**
     * @notice Returns the version string.
     */
    function version() external pure returns (string memory) {
        return "V2";
    }
}

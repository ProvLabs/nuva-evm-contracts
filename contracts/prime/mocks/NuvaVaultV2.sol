// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../NuvaVault.sol";

/**
 * @title NuvaVaultV2
 * @notice Mock version of NuvaVault for testing upgradeability.
 */
contract NuvaVaultV2 is NuvaVault {
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

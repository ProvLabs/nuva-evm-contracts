// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainManager} from "../CrossChainManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title CrossChainManagerV2
 * @notice Mock version of CrossChainManager for testing upgradeability.
 */
contract CrossChainManagerV2 is CrossChainManager {
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
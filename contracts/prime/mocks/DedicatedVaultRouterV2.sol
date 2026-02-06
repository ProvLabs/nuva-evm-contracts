// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../DedicatedVaultRouter.sol";

contract DedicatedVaultRouterV2 is DedicatedVaultRouter {
    // New state variable added AFTER the gap
    bool public isPaused;

    function togglePause() external onlyOwner {
        isPaused = !isPaused;
    }
}

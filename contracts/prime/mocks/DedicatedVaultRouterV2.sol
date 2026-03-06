// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../DedicatedVaultRouter.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error RouterFeeTooHigh();
error RouterFeeAlreadySetToThisValue();

/// @title DedicatedVaultRouterV2
/// @notice V2 Upgrade: Adds the ability for the admin to update a router fee.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract DedicatedVaultRouterV2 is DedicatedVaultRouter {
    // --- New V2 State Variables ---
    // (Appended after V1 storage layout to prevent collisions)
    uint256 public routerFee;
    uint256 public constant MAX_ROUTER_FEE = 1000; // e.g., 10% in basis points

    // --- New V2 Events ---
    event RouterFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes V2 state variables.
     * @dev Uses `reinitializer(2)` to ensure this can only be called exactly once
     * during the transition from V1 to V2.
     * @param initialFee The initial router fee in basis points.
     */
    function initializeV2(uint256 initialFee) external reinitializer(2) {
        if (initialFee > MAX_ROUTER_FEE) revert RouterFeeTooHigh();
        routerFee = initialFee;
    }

    /**
     * @notice Updates the router fee.
     * @dev Only callable by the owner.
     * @param newFee The new router fee amount in basis points.
     */
    function setRouterFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_ROUTER_FEE) revert RouterFeeTooHigh();
        if (newFee == routerFee) revert RouterFeeAlreadySetToThisValue();

        uint256 oldFee = routerFee;
        routerFee = newFee;

        emit RouterFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Returns the version string.
     */
    function version() external pure returns (string memory) {
        return "V2";
    }
}

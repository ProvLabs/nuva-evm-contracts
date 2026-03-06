// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainVault} from "../CrossChainVault.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error MaxTransactionSizeCannotBeZero();
error MaxTransactionSizeAlreadySetToThisValue();

/// @title CrossChainVaultV2
/// @notice V2 Upgrade: Adds the ability for the admin to update a max transaction size.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CrossChainVaultV2 is CrossChainVault {
    // --- New V2 State Variables ---
    // (Appended after V1 storage layout to prevent collisions)
    uint256 public maxTransactionSize;

    // --- New V2 Events ---
    event MaxTransactionSizeUpdated(uint256 oldSize, uint256 newSize);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes V2 state variables.
     * @dev Uses `reinitializer(2)` to ensure this can only be called exactly once
     * during the transition from V1 to V2.
     * @param initialSize The initial max transaction size.
     */
    function initializeV2(uint256 initialSize) external reinitializer(2) {
        if (initialSize == 0) revert MaxTransactionSizeCannotBeZero();
        maxTransactionSize = initialSize;
    }

    /**
     * @notice Updates the max transaction size.
     * @dev Only callable by the owner (admin).
     * @param newSize The new max transaction size.
     */
    function setMaxTransactionSize(uint256 newSize) external onlyOwner {
        if (newSize == 0) revert MaxTransactionSizeCannotBeZero();
        if (newSize == maxTransactionSize)
            revert MaxTransactionSizeAlreadySetToThisValue();

        uint256 oldSize = maxTransactionSize;
        maxTransactionSize = newSize;

        emit MaxTransactionSizeUpdated(oldSize, newSize);
    }

    /**
     * @notice Returns the current version of the contract.
     */
    function version() external pure returns (string memory) {
        return "V2";
    }
}

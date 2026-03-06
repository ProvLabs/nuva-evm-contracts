// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainManager} from "../CrossChainManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error ManagerFeeCannotBeZero();
error ManagerFeeAlreadySetToThisValue();

/// @title CrossChainManagerV2
/// @notice V2 Upgrade: Adds the ability for the admin to update a processing fee.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CrossChainManagerV2 is CrossChainManager {
    
    // --- New V2 State Variables ---
    // (Appended after V1 storage layout to prevent collisions)
    uint256 public processingFee;

    // --- New V2 Events ---
    event ProcessingFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes V2 state variables.
     * @dev Uses `reinitializer(2)` to ensure this can only be called exactly once
     * during the transition from V1 to V2.
     * @param initialFee The initial processing fee.
     */
    function initializeV2(uint256 initialFee) external reinitializer(2) {
        if (initialFee == 0) revert ManagerFeeCannotBeZero();
        processingFee = initialFee;
    }

    /**
     * @notice Updates the processing fee.
     * @dev Only callable by the owner (admin).
     * @param newFee The new processing fee amount.
     */
    function setProcessingFee(uint256 newFee) external onlyOwner {
        if (newFee == 0) revert ManagerFeeCannotBeZero();
        if (newFee == processingFee) revert ManagerFeeAlreadySetToThisValue();

        uint256 oldFee = processingFee;
        processingFee = newFee;

        emit ProcessingFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Returns the version string.
     */
    function version() external pure returns (string memory) {
        return "V2";
    }
}

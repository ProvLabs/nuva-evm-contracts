// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../NuvaVault.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error WithdrawalLimitCannotBeZero();
error WithdrawalLimitAlreadySetToThisValue();

/// @title NuvaVaultV2
/// @notice V2 Upgrade: Adds the ability for the admin to update a withdrawal limit.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract NuvaVaultV2 is NuvaVault {
    // --- New V2 State Variables ---
    // (Appended after V1 storage layout to prevent collisions)
    uint256 public withdrawalLimit;

    // --- New V2 Events ---
    event WithdrawalLimitUpdated(uint256 oldLimit, uint256 newLimit);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes V2 state variables.
     * @dev Uses `reinitializer(2)` to ensure this can only be called exactly once
     * during the transition from V1 to V2.
     * @param initialLimit The initial withdrawal limit.
     */
    function initializeV2(uint256 initialLimit) external reinitializer(2) {
        if (initialLimit == 0) revert WithdrawalLimitCannotBeZero();
        withdrawalLimit = initialLimit;
    }

    /**
     * @notice Updates the withdrawal limit.
     * @dev Only callable by the owner.
     * @param newLimit The new withdrawal limit.
     */
    function setWithdrawalLimit(uint256 newLimit) external onlyOwner {
        if (newLimit == 0) revert WithdrawalLimitCannotBeZero();
        if (newLimit == withdrawalLimit)
            revert WithdrawalLimitAlreadySetToThisValue();

        uint256 oldLimit = withdrawalLimit;
        withdrawalLimit = newLimit;

        emit WithdrawalLimitUpdated(oldLimit, newLimit);
    }

    /**
     * @notice Returns the version string.
     */
    function version() external pure returns (string memory) {
        return "V2";
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainVaultStorage} from "./CrossChainVaultStorage.sol";

/**
 * @title CrossChainVaultState
 * @dev This contract manages the state for cross chain vault operations.
 * @author NU Blockchain Technologies
 * @notice This contract is used to manage the state for cross chain vault operations.
 */
contract CrossChainVaultState {
    /// @notice Storage state for cross chain vault operations
    /// @dev This state is managed by the CrossChainVaultStorage contract
    /// @custom:storage-location erc7201:nuva.crosschainvault.state
    CrossChainVaultStorage.State public _state;
}


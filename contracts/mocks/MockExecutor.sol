// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExecutorArgs, FeeArgs} from "../modules/wormhole/ICCTPv1WithExecutor.sol";

/// @title MockExecutor
/// @notice Mock implementation of the Executor interface for testing
/// @author Nuva Team
contract MockExecutor {
    /// @notice Emitted when depositForBurn is called
    /// @param amount The amount deposited
    /// @param targetChain The target chain
    /// @param targetDomain The target domain
    /// @param targetRecipient The target recipient
    /// @param token The token address
    /// @param executorArgs The executor arguments
    /// @param feeArgs The fee arguments
    event MockDepositForBurn(
        uint256 amount,
        uint16 targetChain,
        uint32 targetDomain,
        bytes32 targetRecipient,
        address token,
        ExecutorArgs executorArgs,
        FeeArgs feeArgs
    );

    /// @notice Mock the depositForBurn function required by CrossChainVault
    /// @param amount The amount to deposit
    /// @param targetChain The target chain
    /// @param targetDomain The target domain
    /// @param targetRecipient The target recipient
    /// @param token The token address
    /// @param executorArgs The executor arguments
    /// @param feeArgs The fee arguments
    /// @return nonce The nonce
    function depositForBurn(
        uint256 amount,
        uint16 targetChain,
        uint32 targetDomain,
        bytes32 targetRecipient,
        address token,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) external payable returns (uint64 nonce) {

        emit MockDepositForBurn(amount, targetChain, targetDomain, targetRecipient, token, executorArgs, feeArgs);
        return 1;
    }
}

// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.19;

struct ExecutorArgs {
    // The refund address used by the Executor.
    address refundAddress;
    // The signed quote to be passed into the Executor.
    bytes signedQuote;
    // The relay instructions to be passed into the Executor.
    bytes instructions;
}

struct FeeArgs {
    // The fee taken in the token being transferred.
    // This is *in addition to* the amount.
    uint256 transferTokenFee;
    // The fee taken in the native token.
    uint256 nativeTokenFee;
    // To whom the fee should be paid (the "referrer").
    address payee;
}

interface ICCTPv1WithExecutor {
    /// @notice Error when the payment to the payee fails.
    /// @dev Selector 0x1e67017f.
    /// @param feeAmount The fee amount.
    error PaymentFailed(uint256 feeAmount);

    /// @notice Deposits and burns tokens from sender to be minted on destination domain using the Executor for relaying.
    /// @param amount amount of tokens to burn
    /// @param destinationChain destination chain ID
    /// @param destinationDomain destination domain (ETH = 0, AVAX = 1)
    /// @param mintRecipient address of mint recipient on destination domain
    /// @param burnToken address of contract to burn deposited tokens, on local domain
    /// @param executorArgs The arguments to be passed into the Executor.
    /// @param feeArgs The arguments used to compute and pay the referrer fee.
    /// @return nonce Circle nonce reserved by message
    ///
    function depositForBurn(
        uint256 amount,
        uint16 destinationChain,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) external payable returns (uint64 nonce);
}

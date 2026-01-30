// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CrossChainVaultStructs
 * @dev This contract defines the structs used for cross chain vault messages.
 * @author NU Blockchain Technologies
 * @notice This contract is used to define the structs used for cross chain vault messages.
 */
contract CrossChainVaultStructs {
    /**
     * @notice CrossChainVaultMessage struct
     * @dev This struct is used to represent a cross chain vault message.
     */
    struct CrossChainVaultMessage {
        // unique identifier for this message type
        uint8 payloadID;
        /**
         * The recipient's wallet address on the target chain, in bytes32
         * format (zero-left-padded if less than 20 bytes).
         */
        bytes32 targetRecipient;
    }
}

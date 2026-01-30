// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BytesLib} from "./modules/utils/BytesLib.sol";
import {CrossChainVaultStructs} from "./CrossChainVaultStructs.sol";

error InvalidPayloadId(); // dev: Invalid payload ID
error InvalidPayloadLength(); // dev: Invalid payload length

/**
 * @title CrossChainVaultMessages
 * @dev This contract handles encoding and decoding of cross chain vault messages.
 * @author NU Blockchain Technologies
 * @notice This contract is used to handle encoding and decoding of cross chain vault messages.
 */
contract CrossChainVaultMessages is CrossChainVaultStructs {
    using BytesLib for bytes;

    /**
     * @notice Encodes the CrossChainVaultMessage struct into bytes
     * @param parsedMessage CrossChainVaultMessage struct
     * @return encodedMessage CrossChainVaultMessage struct encoded into bytes
     */
    function encodePayload(
        CrossChainVaultMessage memory parsedMessage
    ) public pure returns (bytes memory encodedMessage) {
        encodedMessage = abi.encodePacked(
            parsedMessage.payloadID, // payloadID = 1
            parsedMessage.targetRecipient
        );
    }

    /**
     * @notice Decodes bytes into CrossChainVaultMessage struct
     * @dev reverts if:
     * - the message payloadID is not 1
     * - the encodedMessage length is incorrect
     * @param encodedMessage encoded Token message
     * @return parsedMessage CrossChainVaultMessage struct
     */
    function decodePayload(
        bytes memory encodedMessage
    ) public pure returns (CrossChainVaultMessage memory parsedMessage) {
        uint256 index = 0;

        // parse payloadId
        parsedMessage.payloadID = encodedMessage.toUint8(index);
        require(parsedMessage.payloadID == 1, InvalidPayloadId());

        // target wallet recipient
        parsedMessage.targetRecipient = encodedMessage.toBytes32(++index);
        index += 32;

        // confirm that the payload was the expected size
        require(index == encodedMessage.length, InvalidPayloadLength());
    }
}

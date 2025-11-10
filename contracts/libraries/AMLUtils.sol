// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AMLUtils
 * @notice A library providing utility functions for Anti-Money Laundering (AML) signature verification
 * @dev This library contains reusable functions for verifying AML signatures and building message hashes
 * in a consistent way across different contracts.
 * @author NU Blockchain Technologies
 */
library AMLUtils {
    error AmlSignatureExpired();
    error AmlSignatureAlreadyUsed();
    error InvalidAmlSignature();
    error InvalidAmlSigner();

    /**
     * @notice Verifies an AML signature
     * @dev This function checks if the signature is valid, not expired, and not reused
     * @param usedSignatures Mapping to track used signatures to prevent replay attacks
     * @param messageHash The hash of the message that was signed
     * @param _signature The signature to verify
     * @param _deadline The timestamp after which the signature is considered expired
     * @param expectedSigner The address that is expected to have signed the message
     * @custom:reverts AmlSignatureExpired If the signature has expired
     * @custom:reverts AmlSignatureAlreadyUsed If the signature has already been used
     * @custom:reverts InvalidAmlSignature If the signature is invalid
     * @custom:reverts InvalidAmlSigner If the signer is not the expected address
     */
    function verifyAML(
        mapping(bytes32 => bool) storage usedSignatures,
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline,
        address expectedSigner
    ) external {
        // Check if the signature has expired
        if (block.timestamp > _deadline) {
            revert AmlSignatureExpired();
        }

        // Replay Prevention
        if (usedSignatures[messageHash]) {
            revert AmlSignatureAlreadyUsed();
        }

        // Recover the Signer
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        // Validate the Signer
        if (recoveredSigner == address(0)) {
            revert InvalidAmlSignature();
        }  
        if (recoveredSigner != expectedSigner) {
            revert InvalidAmlSigner();
        }

        // Mark Signature as Used
        usedSignatures[messageHash] = true;
    }

    /**
     * @notice Builds the message hash for AML verification
     * @dev This function creates a hash of all relevant parameters to be signed
     * @param sender The address of the transaction sender
     * @param tokenAddress The address of the token being transferred
     * @param shareToken The address of the share token
     * @param _amount The amount of tokens being transferred
     * @param _destinationAddress The destination address for the transfer
     * @param _deadline The deadline for the signature to be valid until
     * @return The keccak256 hash of the packed parameters
     */
    function getMessageHash(
        address sender,
        address tokenAddress,
        address shareToken,
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) external pure returns (bytes32) {
        // This hash MUST match what the frontend AML signer signs
        return
            keccak256(
                abi.encodePacked(
                    sender,
                    tokenAddress,
                    shareToken,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }
}

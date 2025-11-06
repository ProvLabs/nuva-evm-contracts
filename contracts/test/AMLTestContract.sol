// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/AMLUtils.sol";

/**
 * @title AMLTestContract
 * @notice A test contract that demonstrates the usage of AMLUtils library
 * @dev This contract shows how to integrate and use the AMLUtils library
 */
contract AMLTestContract {
    using AMLUtils for *;
    
    // Storage for used signatures to prevent replay attacks
    mapping(bytes32 => bool) public usedSignatures;
    
    // The expected AML signer address
    address public amlSigner;
    
    // Events
    event DepositWithAML(
        address indexed sender,
        address indexed tokenAddress,
        uint256 amount,
        address indexed destination,
        uint256 deadline
    );
    
    // Errors
    error Unauthorized();
    
    /**
     * @dev Constructor sets the AML signer address
     * @param _amlSigner The address of the AML signer
     */
    constructor(address _amlSigner) {
        if (_amlSigner == address(0)) {
            revert AMLUtils.InvalidAmlSigner();
        }
        amlSigner = _amlSigner;
    }
    
    /**
     * @notice Update the AML signer address
     * @dev Only callable by the contract owner
     * @param _newAmlSigner The new AML signer address
     */
    function setAmlSigner(address _newAmlSigner) external {
        // In a real contract, this should have access control
        if (msg.sender != address(0)) { // Replace with proper access control
            revert Unauthorized();
        }
        if (_newAmlSigner == address(0)) {
            revert AMLUtils.InvalidAmlSigner();
        }
        amlSigner = _newAmlSigner;
    }
    
    /**
     * @notice Process a deposit with AML verification
     * @dev This function demonstrates how to use the AMLUtils library
     * @param tokenAddress The address of the token being deposited
     * @param shareToken The address of the share token
     * @param amount The amount of tokens being deposited
     * @param destination The destination address for the deposit
     * @param deadline The deadline for the AML signature
     * @param signature The AML signature
     */
    function depositWithAML(
        address tokenAddress,
        address shareToken,
        uint256 amount,
        address destination,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // Generate the message hash that was signed
        bytes32 messageHash = AMLUtils.getMessageHash(
            msg.sender,
            tokenAddress,
            shareToken,
            amount,
            destination,
            deadline
        );
        
        // Verify the AML signature
        AMLUtils.verifyAML(
            usedSignatures,
            messageHash,
            signature,
            deadline,
            amlSigner
        );
        
        // If we get here, the signature is valid and not expired
        // Add your deposit logic here
        
        emit DepositWithAML(
            msg.sender,
            tokenAddress,
            amount,
            destination,
            deadline
        );
    }
    
    /**
     * @notice Check if a message hash has been used
     * @param messageHash The message hash to check
     * @return bool True if the message hash has been used
     */
    function isSignatureUsed(bytes32 messageHash) external view returns (bool) {
        return usedSignatures[messageHash];
    }
}

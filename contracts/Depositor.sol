// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20Permit} from"@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CustomToken} from "./CustomToken.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// TODO
// access control list for multi admin functionality? read open zeppelin docs

/*
 * @title Depositor
 * @dev This is the LOGIC contract. It will be "cloned" by the factory.
 * It accepts a specified token (depositToken) and sends it to a
 * user-provided destination address.
 */
error InvalidAddress(string); // dev: Address cannot be zero
error InvalidAmount(); // dev: Amount must be greater than zero
error AmlSignatureExpired(); // dev: AML signature has expired
error AmlSignatureAlreadyUsed(); // dev: AML signature has already been used
error InvalidAmlSignature(); // dev: The AML signature is invalid
error InvalidAmlSigner(); // dev: The AML signer is invalid

/**
 * @title Depositor Contract
 * @notice This contract is used to deposit tokens into the contract.
 * @dev This contract handles token deposits with AML verification and permit functionality.
 * It's designed to be cloned by a factory contract for multiple instances.
 * @author NU Blockchain Technologies
 */
contract Depositor is Initializable {
    using SafeERC20 for CustomToken;

    // --- State Variables ---

    /// @notice The token that can be deposited into this contract.
    CustomToken public depositToken;
    
    /// @notice The address of the share token, used for event emissions.
    address public shareToken;
    
    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;
    
    /// @notice Mapping to track used AML signatures to prevent replay attacks.
    mapping(bytes32 => bool) public usedSignatures;

    // --- Events ---

    /**
     * @notice Emitted when a deposit is made.
     * @param user The address of the user making the deposit.
     * @param amount The amount of tokens deposited.
     * @param depositToken The address of the deposit token.
     * @param shareToken The address of the share token.
     * @param destinationAddress The address where the tokens were sent.
     */
    event Deposit(
        address indexed user,
        uint256 amount,
        address depositToken,
        address shareToken,
        address destinationAddress
    );

    // --- Initializer ---

    /**
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _depositTokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _depositTokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        if (_depositTokenAddress == address(0)) {
            revert InvalidAddress("deposit token");
        }
        if (_shareTokenAddress == address(0)) {
            revert InvalidAddress("share token");
        }
        if (_amlSignerAddress == address(0)) {
            revert InvalidAddress("aml signer");
        }

        depositToken = CustomToken(_depositTokenAddress);
        shareToken = _shareTokenAddress;
        amlSigner = _amlSignerAddress;
    }

    // --- Public Functions ---

    /**
     * @notice Deposits tokens after user provides a separate `approve`.
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     */
    function deposit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        _doDeposit(_amount, _destinationAddress);
    }

    /**
     * @notice Deposits tokens using an off-chain 'permit' signature.
     * @dev This allows for a single-transaction approve+deposit.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v The recovery byte of the EIP-712 permit signature.
     * @param _r First 32 bytes of the EIP-712 permit signature.
     * @param _s Second 32 bytes of the EIP-712 permit signature.
     */
    function depositWithPermit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        // This call will fail if the signature is invalid or deadline passed.
        IERC20Permit(address(depositToken)).permit(
            msg.sender, // The user (owner)
            address(this), // The spender (this contract)
            _amount, // The amount
            _permitDeadline, // Expiration
            _v,
            _r,
            _s // The user's signature
        );

        _doDeposit(_amount, _destinationAddress);
    }

    // --- Private Helper Functions ---

    /**
     * @notice Internal function to perform the token transfer and emit the Deposit event.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address where tokens will be sent.
     */
    function _doDeposit(uint256 _amount, address _destinationAddress) private {
        if (_amount == 0) {
            revert InvalidAmount();
        }
        if (_destinationAddress == address(0)) {
            revert InvalidAddress("destination");
        }

        depositToken.safeTransferFrom(msg.sender, _destinationAddress, _amount);

        emit Deposit(msg.sender, _amount, address(depositToken), shareToken, _destinationAddress);
    }

    /**
     * @notice Internal function to verify the AML signature.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param messageHash The hash of the message to verify.
     * @param _signature The signature to verify.
     * @param _deadline The expiration timestamp for the signature.
     */
    function _verifyAML(
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline
    ) private {
        verifyAML(messageHash, _signature, _deadline, amlSigner);
    }

    /**
     * @notice Internal function to build the AML message hash.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _amount The amount of tokens for the deposit.
     * @param _destinationAddress The address where tokens will be sent.
     * @param _deadline The expiration timestamp for the message.
     * @return The hashed message used for AML signature verification.
     */
    function _getMessageHash(
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        return getMessageHash(
            msg.sender,
            _amount,
            _destinationAddress,
            _deadline
        );
    }

    /**
     * @notice Verifies an AML signature
     * @dev This function checks if the signature is valid, not expired, and not reused
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
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline,
        address expectedSigner
    ) private {
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
     * @param _amount The amount of tokens being transferred
     * @param _destinationAddress The destination address for the transfer
     * @param _deadline The deadline for the signature to be valid until
     * @return The keccak256 hash of the packed parameters
     */
    function getMessageHash(
        address sender,
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        // This hash MUST match what the frontend AML signer signs
        return
            keccak256(
                abi.encodePacked(
                    sender,
                    address(depositToken),
                    shareToken,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }
}

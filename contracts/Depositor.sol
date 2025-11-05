// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20Permit} from"@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {CustomToken} from "./CustomToken.sol";

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

contract Depositor is Initializable {
    using SafeERC20 for CustomToken;

    // --- State Variables ---

    CustomToken public depositToken;
    address public shareToken;
    address public amlSigner;
    mapping(bytes32 => bool) public usedSignatures;

    // --- Events ---

    event Deposit(
        address indexed user,
        uint256 amount,
        address indexed shareToken,
        address indexed destinationAddress
    );

    // --- Initializer ---

    /**
     * @dev Initializer. Replaces the constructor.
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
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v, _r, _s The components of the EIP-712 permit signature from the user.
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
     * @dev Internal function to perform the token transfer.
     */
    function _doDeposit(uint256 _amount, address _destinationAddress) private {
        if (_amount == 0) {
            revert InvalidAmount();
        }
        if (_destinationAddress == address(0)) {
            revert InvalidAddress("destination");
        }

        depositToken.safeTransferFrom(msg.sender, _destinationAddress, _amount);

        emit Deposit(msg.sender, _amount, shareToken, _destinationAddress);
    }

    /**
     * @dev Internal function to verify the AML signature.
     */
    function _verifyAML(
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline
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
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(
            messageHash
        );
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        // Validate the Signer
        if (recoveredSigner == address(0)) {
            revert InvalidAmlSignature();
        }
        if (recoveredSigner != amlSigner) {
            revert InvalidAmlSigner();
        }

        // Mark Signature as Used
        usedSignatures[messageHash] = true;
    }

    /**
     * @dev Internal function to build the AML message hash.
     */
    function _getMessageHash(
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        // This hash MUST match what the frontend AML signer signs
        return
            keccak256(
                abi.encodePacked(
                    msg.sender,
                    address(depositToken),
                    shareToken,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }
}

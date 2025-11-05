// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {CustomToken} from "./CustomToken.sol";


contract Withdrawal is Initializable, AccessControlUpgradeable {
    using SafeERC20 for CustomToken;

    // --- State Variables ---

    /// @notice The token that can be withdrawn from this contract.
    CustomToken public withdrawalToken;
    /// @notice The address of the share token, used for logging purposes.
    address public shareToken;
    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;
    /// @notice A mapping to prevent the reuse of AML signatures.
    mapping(bytes32 => bool) public usedSignatures;
    /// @notice The role required to burn locked tokens.
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");

    // --- Errors ---

    error InvalidAddress();
    error AmountMustBeGreaterThanZero();
    error AMLSignatureExpired();
    error AMLSignatureAlreadyUsed();
    error InvalidAMLSignature();
    error InvalidAMLSigner();

    // --- Events ---

    /**
     * @notice Emitted when a user withdraws tokens.
     * @param user The address of the user who initiated the withdrawal.
     * @param amount The amount of tokens withdrawn.
     * @param shareToken The address of the share token associated with the withdrawal.
     * @param destinationAddress The address where the withdrawn tokens are sent.
     */
    event Withdraw(
        address indexed user,
        uint256 amount,
        address indexed shareToken,
        address indexed destinationAddress
    );

    // --- Initializer ---

    /**
     * @dev Initializer. Replaces the constructor.
     * @param _withdrawalTokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _withdrawalTokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        __AccessControl_init();
        if (_withdrawalTokenAddress == address(0)) {
            revert InvalidAddress();
        }
        if (_shareTokenAddress == address(0)) {
            revert InvalidAddress();
        }
        if (_amlSignerAddress == address(0)) {
            revert InvalidAddress();
        }

        withdrawalToken = CustomToken(_withdrawalTokenAddress);
        shareToken = _shareTokenAddress;
        amlSigner = _amlSignerAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BURN_ROLE, msg.sender);
    }

    // --- Public Functions ---

    /**
     * @notice Allows a user to withdraw tokens after passing an AML check.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The deadline for the AML signature.
     */
    function withdraw(
        uint256 _amount,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external {
        if (_amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }

        bytes32 messageHash = _getMessageHash(
            _amount,
            address(this),
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        _doWithdraw(_amount);
    }

    /**
     * @notice Allows a user to withdraw tokens using a permit, avoiding the need for a separate approval transaction.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The deadline for the AML signature.
     * @param _permitDeadline The deadline for the permit signature.
     * @param _v The v component of the permit signature.
     * @param _r The r component of the permit signature.
     * @param _s The s component of the permit signature.
     */
    function withdrawWithPermit(
        uint256 _amount,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        if (_amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }

        bytes32 messageHash = _getMessageHash(
            _amount,
            address(this),
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        IERC20Permit(address(withdrawalToken)).permit(
            msg.sender,
            address(this),
            _amount,
            _permitDeadline,
            _v,
            _r,
            _s
        );

        _doWithdraw(_amount);
    }

    // --- Private Helper Functions ---

    /**
     * @dev Internal function to handle the withdrawal logic.
     * @param _amount The amount of tokens to withdraw.
     */
    function _doWithdraw(uint256 _amount) private {
        withdrawalToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Withdraw(msg.sender, _amount, shareToken, address(this));
    }

    /**
     * @notice Allows an address with the BURN_ROLE to burn tokens held by this contract.
     * @param _amount The amount of tokens to burn.
     */
    function burnLocked(uint256 _amount) external onlyRole(BURN_ROLE) {
        if (_amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }
        withdrawalToken.burnAuthorized(address(this), _amount);
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
            revert AMLSignatureExpired();
        }

        // Replay Prevention
        if (usedSignatures[messageHash]) {
            revert AMLSignatureAlreadyUsed();
        }

        // Recover the Signer
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(
            messageHash
        );
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        // Validate the Signer
        if (recoveredSigner == address(0)) {
            revert InvalidAMLSignature();
        }
        if (recoveredSigner != amlSigner) {
            revert InvalidAMLSigner();
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
                    address(withdrawalToken),
                    shareToken,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }
}

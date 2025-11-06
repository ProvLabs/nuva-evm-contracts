// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CustomToken} from "./CustomToken.sol";
import {AMLUtils} from "./libraries/AMLUtils.sol";


/**
 * @title Withdrawal Contract
 * @notice Handles secure token withdrawals with AML verification and permit functionality.
 * @dev This contract provides a secure way to withdraw tokens from the contract
 @author NU Blockchain Technologies
 */
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

    error InvalidAddress(string); // dev: Address cannot be zero
    error InvalidAmount(); // dev: Amount must be greater than zero
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
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _withdrawalTokenAddress The address of the token that can be withdrawn.
     * @param _shareTokenAddress The address of the share token for logging purposes.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _withdrawalTokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        __AccessControl_init();
        if (_withdrawalTokenAddress == address(0)) {
            revert InvalidAddress("Invalid withdrawal token");
        }
        if (_shareTokenAddress == address(0)) {
            revert InvalidAddress("Invalid share token");
        }
        if (_amlSignerAddress == address(0)) {
            revert InvalidAddress("Invalid AML signer");
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
     * @dev The function verifies the AML signature and deadline before processing the withdrawal.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The expiration timestamp for the AML signature.
     */
    function withdraw(
        uint256 _amount,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external {
        if (_amount == 0) {
            revert InvalidAmount(); // dev: Amount must be greater than zero
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
     * @dev Combines permit functionality with AML checks for gas-efficient withdrawals.
     * @param _amount The amount of tokens to withdraw.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The expiration timestamp for the AML signature.
     * @param _permitDeadline The expiration timestamp for the permit signature.
     * @param _v The recovery byte of the permit signature.
     * @param _r First 32 bytes of the permit signature.
     * @param _s Second 32 bytes of the permit signature.
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
            revert InvalidAmount(); // dev: Amount must be greater than zero
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
     * @notice Handles the withdrawal logic by transferring tokens from the sender to this contract.
     * @param _amount The amount of tokens to withdraw.
     */
    function _doWithdraw(uint256 _amount) private {
        withdrawalToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Withdraw(msg.sender, _amount, shareToken, address(this));
    }

    /**
     * @notice Allows an address with the BURN_ROLE to burn tokens held by this contract.
     * @dev Only callable by addresses with the BURN_ROLE.
     * @param _amount The amount of tokens to burn.
     */
    function burnLocked(uint256 _amount) external onlyRole(BURN_ROLE) {
        if (_amount == 0) {
            revert InvalidAmount(); // dev: Amount must be greater than zero
        }
        withdrawalToken.burnAuthorized(address(this), _amount);
    }

    /**
     * @notice Verifies an AML signature for a withdrawal.
     * @dev Internal function to verify the AML signature.
     * @param messageHash The hash of the message to verify.
     * @param _signature The signature to verify.
     * @param _deadline The expiration timestamp for the signature.
     */
    function _verifyAML(
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline
    ) private {
        AMLUtils.verifyAML(usedSignatures, messageHash, _signature, _deadline, amlSigner);
    }

    /**
     * @notice Generates a message hash for AML verification by hashing the withdrawal details.
     * @dev Internal function to build the AML message hash.
     * @param _amount The amount of tokens for the withdrawal.
     * @param _destinationAddress The address where tokens will be sent.
     * @param _deadline The expiration timestamp for the message.
     * @return The hashed message used for AML signature verification.
     */
    function _getMessageHash(
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        return AMLUtils.getMessageHash(
            msg.sender,
            address(withdrawalToken),
            shareToken,
            _amount,
            _destinationAddress,
            _deadline
        );
    }
}

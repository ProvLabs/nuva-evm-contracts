// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AMLUtils} from "./libraries/AMLUtils.sol";

/**
 * @title ICustomToken
 * @notice Minimal interface for CustomToken that only exposes the functions we need
 * @author NU Blockchain Technologies
 */
interface ICustomToken is IERC20, IERC20Permit {
    /**
     * @notice Burns a specified amount of tokens from the caller's balance.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external;

    /**
     * @notice Burns a specified amount of tokens from a specified address.
     * @dev The caller must have been approved to spend at least `amount` tokens on behalf of `account`.
     * @param account The address to burn tokens from.
     * @param amount The amount of tokens to burn.
     */
    function burnFrom(address account, uint256 amount) external;
}


/**
 * @title Withdrawal Contract
 * @notice Handles secure token withdrawals with AML verification and permit functionality.
 * @dev This contract provides a secure way to withdraw tokens from the contract
 @author NU Blockchain Technologies
 */
contract Withdrawal is Initializable, AccessControlUpgradeable {
    using SafeERC20 for ICustomToken;

    // --- Constants ---
    
    /// @notice Role for burning locked tokens
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");

    // --- State Variables ---

    /// @notice The token being withdrawn and burned withdrawn from this contract.
    ICustomToken public withdrawalToken;
    /// @notice The address of the payment token, used for logging purposes.
    address public paymentToken;
    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;
    /// @notice A mapping to prevent the reuse of AML signatures.
    mapping(bytes32 => bool) public usedSignatures;

    // --- Errors ---

    error InvalidAddress(string); // dev: Address cannot be zero
    error AmountMustBeGreaterThanZero(); // dev: Amount must be greater than zero
    error InsufficientBalance(); // dev: Contract does not have enough tokens to burn
    error AMLSignatureExpired();
    error AMLSignatureAlreadyUsed();
    error InvalidAMLSignature();
    error InvalidAMLSigner();

    // --- Events ---

    /**
     * @notice Emitted when a user withdraws tokens.
     * @param withdrawalTokenAddress The address of the withdrawal token.
     * @param paymentTokenAddress The address of the payment token.
     * @param amlSignerAddress The address of the AML signer.
     */
    event WithdrawalInitialized(
        address indexed withdrawalTokenAddress,
        address indexed paymentTokenAddress,
        address indexed amlSignerAddress
    );

    /**
     * @notice Emitted when a user withdraws tokens.
     * @param user The address of the user who initiated the withdrawal.
     * @param amount The amount of tokens withdrawn.
     * @param paymentToken The address of the payment token associated with the withdrawal.
     */
    event Withdraw(
        address indexed user,
        uint256 indexed amount,
        address indexed paymentToken
    );

    // --- Initializer ---

    /**
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _withdrawalTokenAddress The address of the token that can be withdrawn.
     * @param _paymentTokenAddress The address of the payment token for logging purposes.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _withdrawalTokenAddress,
        address _paymentTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        __AccessControl_init();
        if (_withdrawalTokenAddress == address(0)) {
            revert InvalidAddress("Invalid withdrawal token");
        }
        if (_paymentTokenAddress == address(0)) {
            revert InvalidAddress("Invalid payment token");
        }
        if (_amlSignerAddress == address(0)) {
            revert InvalidAddress("Invalid AML signer");
        }

        withdrawalToken = ICustomToken(_withdrawalTokenAddress);
        paymentToken = _paymentTokenAddress;
        amlSigner = _amlSignerAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BURN_ROLE, msg.sender);

        emit WithdrawalInitialized(_withdrawalTokenAddress, _paymentTokenAddress, _amlSignerAddress);
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
            revert AmountMustBeGreaterThanZero(); // dev: Amount must be greater than zero
        }

        bytes32 messageHash = _getMessageHash(
            _amount,
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
            revert AmountMustBeGreaterThanZero(); // dev: Amount must be greater than zero
        }

        bytes32 messageHash = _getMessageHash(
            _amount,
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        withdrawalToken.permit(
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

        emit Withdraw(msg.sender, _amount, paymentToken);
    }

    /**
     * @notice Emitted when tokens are burned from the contract.
     * @param amount The amount of tokens burned.
     * @param burner The address that initiated the burn.
     */
    event TokensBurned(uint256 indexed amount, address indexed burner);

    /**
     * @notice Burns a specified amount of tokens held by this contract.
     * @dev Only callable by addresses with the BURN_ROLE. This function is part of the
     * manual burn/mint model to maintain token supply across different chains.
     * @param _amount The amount of tokens to burn. Must be greater than zero and not exceed
     * the contract's token balance.
     * @custom:requirements
     * - Caller must have BURN_ROLE
     * - `_amount` must be greater than zero
     * - Contract must have sufficient token balance
     */
    function burn(uint256 _amount) external onlyRole(BURN_ROLE) {
        if (_amount == 0) {
            revert AmountMustBeGreaterThanZero();
        }
        
        // Ensure the contract has enough tokens to burn
        uint256 contractBalance = withdrawalToken.balanceOf(address(this));
        if (_amount > contractBalance) {
            revert InsufficientBalance();
        }
        
        // Burn the tokens using the CustomToken's burnAuthorized function
        withdrawalToken.burnFrom(address(this), _amount);
        
        emit TokensBurned(_amount, msg.sender);
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
     * @param _deadline The expiration timestamp for the message.
     * @return The hashed message used for AML signature verification.
     */
    function _getMessageHash(
        uint256 _amount,
        uint256 _deadline
    ) private view returns (bytes32) {
        return AMLUtils.getMessageHash(
            msg.sender,
            address(withdrawalToken),
            paymentToken,
            _amount,
            address(this),
            _deadline
        );
    }
}

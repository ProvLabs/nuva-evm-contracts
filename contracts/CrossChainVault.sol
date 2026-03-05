// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {BytesLib} from "./modules/utils/BytesLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICCTPv1WithExecutor, ExecutorArgs, FeeArgs} from "./modules/wormhole/ICCTPv1WithExecutor.sol";

error InvalidExecutorAddress(); // dev: invalid executor address
error InvalidTokenAddress(); // dev: invalid token address
error AmountMustBeGreaterThanZero(); // dev: amount must be greater than zero
error TargetRecipientCannotBeBytes32Zero(); // dev: target recipient cannot be bytes32(0)
error NormalizedAmountMustBeGreaterThanZero(); // dev: normalized amount must be greater than zero
error InsufficientValue(); // dev: insufficient value
error AmountMismatch(); // dev: amount mismatch
error InvalidAddress(string); // dev: Address cannot be zero
error AddressNotWhitelisted(); // dev: Address not whitelisted

/**
 * @title A Cross-Chain Token Application
 * @notice This contract uses Wormhole's token bridge contract to send tokens
 * cross chain with an aribtrary message payload.
 * @author NU Blockchain Technologies
 */
contract CrossChainVault is 
    Initializable, 
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable  {
    using BytesLib for bytes;

    // --- State Variables ---

    /// @notice The executor contract
    ICCTPv1WithExecutor public executor;

    /// @notice The role of whitelisted addresses
    bytes32 public constant WHITELISTED_ROLE = keccak256("WHITELISTED_ROLE");
    
    // --- Events ---

    /**
     * @notice Emitted when a depositor is initialized.
     * @param token Address of `token` to be transferred
     * @param amount Amount of `token` to be transferred
     * @param targetChain Wormhole chain ID of the target blockchain
     * @param targetDomain Circle's domain ID of the target blockchain
     * @param targetRecipient Address in bytes32 format (zero-left-padded if
     * less than 20 bytes) of the recipient's wallet on the target blockchain.
     * @param nonce The nonce of wormhole message
     */
    event TokensSent(
        address indexed token,
        uint256 amount,
        uint16 targetChain,
        uint32 targetDomain,
        bytes32 targetRecipient,
        uint64 nonce
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @notice constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Deploys the smart contract and sanity checks initial deployment values
     * @dev Sets the executor state variable.
     * @param executor_ The address of the executor contract
     */
    function initialize(address executor_) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender); // Ownable2Step uses this internal call
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // sanity check input values
        if (executor_ == address(0)) revert InvalidExecutorAddress();

        // set constructor state variables
        executor = ICCTPv1WithExecutor(executor_);
    }

    /**
     * @notice Transfers specified tokens to any registered Token contract
     * by invoking the `depositForBurn` method on the Wormhole token
     * bridge contract. `depositForBurn` allows the caller to send
     * an arbitrary message payload along with a token transfer. In this case,
     * the arbitrary message includes the transfer recipient's target-chain
     * wallet address.
     * @dev reverts if:
     * - `token` is address(0)
     * - `amount` is zero
     * - `targetRecipient` is bytes32(0)
     * - a registered Token contract does not exist for the `targetChain`
     * - caller doesn't pass enough value to pay the Wormhole network fee
     * - normalized `amount` is zero
     * @param token Address of `token` to be transferred
     * @param amount Amount of `token` to be transferred
     * @param targetChain Wormhole chain ID of the target blockchain
     * @param targetDomain Circle's domain ID of the target blockchain
     * @param targetRecipient Address in bytes32 format (zero-left-padded if
     * less than 20 bytes) of the recipient's wallet on the target blockchain.
     * @param executorArgs The executor arguments
     * @param feeArgs The fee arguments
     */
    function sendTokens(
        address token,
        uint256 amount,
        uint16 targetChain,
        uint32 targetDomain,
        bytes32 targetRecipient,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) external payable nonReentrant onlyRole(WHITELISTED_ROLE) {
        // sanity check function arguments
        if (token == address(0)) revert InvalidTokenAddress();
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        if (targetRecipient == bytes32(0)) revert TargetRecipientCannotBeBytes32Zero();

        /**
         * Compute the normalized amount to verify that it's nonzero.
         * The token bridge peforms the same operation before encoding
         * the amount in the `depositForBurn` message.
         */
        if (normalizeAmount(amount, getDecimals(token)) == 0) revert NormalizedAmountMustBeGreaterThanZero();

        uint256 balanceBefore = getBalance(token);

        // transfer tokens from user to the this contract
        uint256 amountReceived = custodyTokens(token, amount);

        uint256 balanceAfter = getBalance(token);

        if (balanceAfter != balanceBefore + amount) revert AmountMismatch();

        // approve the token bridge to spend the specified tokens
        SafeERC20.forceApprove(
            IERC20(token),
            address(executor),
            amountReceived
        );

        // removed fees from the token amount
        uint256 amountTransferred = amountReceived - feeArgs.transferTokenFee;

        uint64 nonce = executor.depositForBurn{value: msg.value}(
            amountTransferred, 
            targetChain, 
            targetDomain, 
            targetRecipient, 
            token, 
            executorArgs, 
            feeArgs
        );

        emit TokensSent(token, amount, targetChain, targetDomain, targetRecipient, nonce);
    }

    /**
     * @notice Get the list of whitelisted addresses
     * @dev Helper function to get the full list of addresses.
     * @return The list of whitelisted addresses
     */
    function getWhitelist() public view returns (address[] memory) {
        uint256 count = getRoleMemberCount(WHITELISTED_ROLE);
        address[] memory members = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            members[i] = getRoleMember(WHITELISTED_ROLE, i);
        }
        return members;
    }

    /**
     * @notice Custodies tokens by transferring them from the caller to this contract.
     * @param token Address of the token to custody.
     * @param amount Amount of tokens to custody.
     * @return balanceDifference The difference in token balance after the transfer.
     */
    function custodyTokens(
        address token,
        uint256 amount
    ) internal returns (uint256) {
        // query own token balance before transfer
        uint256 balanceBefore = getBalance(token);

        // deposit tokens
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );

        // return the balance difference
        return getBalance(token) - balanceBefore;
    }

    /**
     * @notice Gets the balance of the specified token for this contract.
     * @param token Address of the token to check.
     * @return balance The balance of the specified token for this contract.
     */
    function getBalance(address token) internal view returns (uint256 balance) {
        // fetch the specified token balance for this contract
        (, bytes memory queriedBalance) =
            token.staticcall(
                abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
            );
        balance = abi.decode(queriedBalance, (uint256));
    }

    /**
     * @notice Gets the decimals of the specified token.
     * @param token Address of the token to check.
     * @return decimals The decimals of the specified token.
     */
    function getDecimals(
        address token
    ) internal view returns (uint8) {
        (,bytes memory queriedDecimals) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        return abi.decode(queriedDecimals, (uint8));
    }

    /**
     * @notice Normalizes the amount of tokens to a standard unit.
     * @param amount The amount of tokens to normalize.
     * @param decimals The decimals of the token.
     * @return normalizedAmount The normalized amount of tokens.
     */
    function normalizeAmount(
        uint256 amount,
        uint8 decimals
    ) internal pure returns(uint256) {
        if (decimals > 8) {
            amount /= 10 ** (decimals - 8);
        }
        return amount;
    }

    // --- Upgrade Safety ---
    // 1 slot used: executor (address)
    uint256[49] private __gap;

    /**
     * @notice Authorizes a contract upgrade.
     * @dev Only callable by the owner.
     * @param newImplementation Address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Upgrade authorized
    }
}

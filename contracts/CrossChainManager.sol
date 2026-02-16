// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {CustomToken} from "./CustomToken.sol";
import {CrossChainVault, ExecutorArgs, FeeArgs} from "./CrossChainVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
contract CrossChainManager is 
    Initializable, 
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable 
{
    using SafeERC20 for CustomToken;

    // --- Constants ---

    /// @notice Role for managing the destination address allow list.
    bytes32 public constant DESTINATION_MANAGER_ADMIN_ROLE = keccak256("DESTINATION_MANAGER_ADMIN_ROLE");
    
    /// @notice Role for depositing tokens into the contract.
    bytes32 public constant DESTINATION_MANAGER_ROLE = keccak256("DESTINATION_MANAGER_ROLE");

    // --- State Variables ---

    /// @notice The token that can be deposited into this contract.
    CustomToken public depositToken;

    /// @notice The token that can be deposited into this contract.
    CrossChainVault public crossChainVault;

    /// @notice The address of the share token, used for event emissions.
    address public shareToken;

    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;

    /// @notice Array of all allowed destination addresses.
    address[] public destinationAddresses;

    /// @notice Mapping to track used AML signatures to prevent replay attacks.
    mapping(bytes32 => bool) public usedSignatures;

    // --- Events ---

    /**
     * @notice Emitted when a depositor is initialized.
     * @param depositTokenAddress The address of the deposit token.
     * @param shareTokenAddress The address of the withdrawal token.
     * @param amlSignerAddress The address of the AML signer.
     * @param destinationManagerAddress The address of the destination address manager.
     * @param crossChainVaultAddress The address of the cross chain vault.
     */
    event CrossChainManagerInitialized(
        address indexed depositTokenAddress,
        address shareTokenAddress,
        address amlSignerAddress,
        address destinationManagerAddress,
        address crossChainVaultAddress
    );

    /**
     * @notice Emitted when cross chain config is updated.
     * @param crossChainVaultAddress The address of the cross chain vault.
     */
    event CrossChainConfigUpdated(
        address indexed crossChainVaultAddress
    );

    /**
     * @notice Emitted when a deposit is made.
     * @param user The address of the user making the deposit.
     * @param amount The amount of tokens deposited.
     * @param depositToken The address of the deposit token.
     * @param shareToken The address of the share token.
     * @param destinationAddress The address where the tokens were sent.
     * @param targetChain The target chain to deposit to.
     */
    event Deposited(
        address indexed user,
        uint256 amount,
        address depositToken,
        address shareToken,
        address destinationAddress,
        uint16 targetChain
    );

    /// @notice Emitted when destination addresses are altered.
    /// @param destination The destination address.
    event DestinationAddressAdded(address indexed destination);
    
    /// @notice Emitted when destination addresses are altered.
    /// @param destination The destination address.
    event DestinationAddressRemoved(address indexed destination);
    
    /// @notice Emitted when destination addresses are altered.
    /// @param destination The destination address.
    event DestinationAddressSkipped(address indexed destination);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ---

    /**
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _depositTokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @param _destinationManagerAddress The address of the destination manager.
     * @param crossChainVaultAddress The address of the cross chain vault.
     */
    function initialize(
        address _depositTokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress,
        address _destinationManagerAddress,
        address crossChainVaultAddress
    ) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender); // Ownable2Step uses this internal call
        __AccessControl_init();
        __ReentrancyGuard_init();

        if (_depositTokenAddress == address(0)) revert InvalidAddress("deposit token");
        if (_shareTokenAddress == address(0)) revert InvalidAddress("share token");
        if (_amlSignerAddress == address(0)) revert InvalidAddress("aml signer");
        if (_destinationManagerAddress == address(0)) revert InvalidAddress("destination manager");
        if (crossChainVaultAddress == address(0)) revert InvalidAddress("cross chain vault");

        depositToken = CustomToken(_depositTokenAddress);
        shareToken = _shareTokenAddress;
        amlSigner = _amlSignerAddress;
        crossChainVault = CrossChainVault(crossChainVaultAddress);

        _setRoleAdmin(DESTINATION_MANAGER_ROLE, DESTINATION_MANAGER_ADMIN_ROLE);
        _grantRole(DESTINATION_MANAGER_ADMIN_ROLE, _destinationManagerAddress);

        emit CrossChainManagerInitialized(
            _depositTokenAddress,
            _shareTokenAddress,
            _amlSignerAddress,
            _destinationManagerAddress,
            crossChainVaultAddress
        );
    }

    // --- Public Functions ---

    /**
     * @notice Updates the cross chain vault address.
     * @dev Can only be called by the destination manager.
     * @param crossChainVaultAddress The cross chain vault address.
     */
    function updateCrossChainConfig(
        address crossChainVaultAddress
    ) external onlyRole(DESTINATION_MANAGER_ROLE) {
        if (crossChainVaultAddress == address(0)) revert InvalidAddress("cross chain vault");

        crossChainVault = CrossChainVault(crossChainVaultAddress);

        emit CrossChainConfigUpdated(crossChainVaultAddress);
    }

    /**
     * @notice Deposits tokens after user provides a separate `approve`.
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param targetChain The target chain to deposit to.
     * @param targetDomain Circle's domain ID of the target blockchain
     * @param executorArgs The executor arguments
     * @param feeArgs The fee arguments
     */
    function deposit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint16 targetChain,
        uint32 targetDomain,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) external payable nonReentrant {
        bytes32 messageHash = _getMessageHash(_amount, _destinationAddress, _amlDeadline);
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        _doDeposit(_amount, _destinationAddress, targetChain, targetDomain, executorArgs, feeArgs);
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
     * @param targetChain The target chain to deposit to.
     * @param targetDomain Circle's domain ID of the target blockchain
     * @param executorArgs The executor arguments
     * @param feeArgs The fee arguments
     */
    function depositWithPermit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint16 targetChain,
        uint32 targetDomain,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) external payable {
        bytes32 messageHash = _getMessageHash(_amount, _destinationAddress, _amlDeadline);
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

        _doDeposit(_amount, _destinationAddress, targetChain, targetDomain, executorArgs, feeArgs);
    }

    /**
     * @notice Get the cross chain vault address
     * @dev Helper function to get the full list of addresses.
     * @return The address of the cross chain vault
     */
    function getCrossChainContractAddress() public view returns (address) {
        return address(crossChainVault);
    }

    /**
     * @notice Get the list of destination addresses
     * @dev Helper function to get the full list of addresses.
     * @return The list of destination addresses
     */
    function getDestinationAddresses() public view returns (address[] memory) {
        return destinationAddresses;
    }

    /**
     * @notice Checks if an address exists in the destination array.
     * @dev Checks if an address exists in the destination array.
     * @param _destination The address to check.
     * @return True if the address exists in the destination array, false otherwise.
     */
    function isDestination(address _destination) public view returns (bool) {
        for (uint i = 0; i < destinationAddresses.length; i++) {
            if (destinationAddresses[i] == _destination) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Adds a destination address to the array only if it doesn't already exist.
     * @dev Adds a destination address to the array only if it doesn't already exist.
     * @param _destination The address to attempt to add.
     */
    function addDestinationAddress(address _destination) external onlyRole(DESTINATION_MANAGER_ROLE) {
        if (_destination == address(0)) revert InvalidAddress("destination address");

        // Check if the address already exists by iterating (efficient for small arrays < 5)
        for (uint i = 0; i < destinationAddresses.length; i++) {
            if (destinationAddresses[i] == _destination) {
                emit DestinationAddressSkipped(_destination);
                return;
            }
        }

        destinationAddresses.push(_destination);
        emit DestinationAddressAdded(_destination);
    }

    /**
     * @notice Removes a destination address from the array.
     * @dev Removes a destination address from the array.
     * Note: This changes the order of the array (swap and pop) for gas efficiency.
     * @param _destination The address to remove.
     */
    function removeDestinationAddress(address _destination) external onlyRole(DESTINATION_MANAGER_ROLE) {
        for (uint i = 0; i < destinationAddresses.length; i++) {
            if (destinationAddresses[i] == _destination) {
                // Move the last element into the place to delete
                destinationAddresses[i] = destinationAddresses[destinationAddresses.length - 1];
                // Remove the last element
                destinationAddresses.pop();

                emit DestinationAddressRemoved(_destination);
                return;
            }
        }

        emit DestinationAddressSkipped(_destination);
    }

    // --- Private Helper Functions ---

    /**
     * @notice Internal function to perform the token transfer and emit the Deposit event.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address where tokens will be sent.
     * @param targetChain The target chain to deposit to.
     * @param targetDomain Circle's domain ID of the target blockchain
     * @param executorArgs The executor arguments
     * @param feeArgs The fee arguments
     */
    function _doDeposit(
        uint256 _amount, 
        address _destinationAddress,
        uint16 targetChain,
        uint32 targetDomain,
        ExecutorArgs calldata executorArgs,
        FeeArgs calldata feeArgs
    ) private {
        if (_amount == 0) revert InvalidAmount();
        if (_destinationAddress == address(0)) revert InvalidAddress("destination");
        if (!isDestination(_destinationAddress)) revert InvalidAddress("destination");

        // Pull tokens from the user to this contract
        depositToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve the Vault to spend the tokens just pulled
        depositToken.forceApprove(address(crossChainVault), _amount);

        // Calling the vault
        crossChainVault.sendTokens{value: msg.value}(
            address(depositToken), 
            _amount, 
            targetChain, 
            targetDomain, 
            bytes32(uint256(uint160(_destinationAddress))),
            executorArgs,
            feeArgs
        );

        emit Deposited(msg.sender, _amount, address(depositToken), shareToken, _destinationAddress, targetChain);
    }

    /**
     * @notice Internal function to verify the AML signature.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param messageHash The hash of the message to verify.
     * @param _signature The signature to verify.
     * @param _deadline The expiration timestamp for the signature.
     */
    function _verifyAML(bytes32 messageHash, bytes calldata _signature, uint256 _deadline) private {
        if (block.timestamp > _deadline) revert AmlSignatureExpired();
        if (usedSignatures[messageHash]) revert AmlSignatureAlreadyUsed();

        bytes32 ethSignedHash = MessageHashUtils.toTypedDataHash(_getDomainSeparator(), messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        if (recoveredSigner == address(0)) revert InvalidAmlSignature();
        if (recoveredSigner != amlSigner) revert InvalidAmlSigner();

        usedSignatures[messageHash] = true;
    }

    /**
     * @notice Returns the domain separator for the current chain.
     * @return The domain separator for the current chain.
     */
    function _getDomainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256("Depositor"),
                    keccak256("1"),
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @notice Calculates the hash of the struct using abi.encode (standard EIP-712).
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _deadline The expiration timestamp for the signature.
     * @return The hash of the struct.
     */
    function _getMessageHash(
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("Deposit(address sender,uint256 amount,address destinationAddress,uint256 deadline)"),
                    msg.sender,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }

     // --- Upgrade Safety ---
    // 10 slots: assetVault, asset, stakingVault, stakingAsset, nuvaVault, nuvaAsset, amlSigner, redemptionProxyImplementation, redemptionProxyToUser, usedSignatures
    // reentrancyStatus slot is namespaced
    uint256[40] private __gap;

    /**
     * @dev Authorizes a contract upgrade. Only callable by the owner.
     * @param newImplementation Address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Upgrade authorized
    }
}

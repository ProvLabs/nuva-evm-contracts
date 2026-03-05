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
import {ICustomToken} from "./modules/utils/ICustomToken.sol";

/*
 * @title CrossChainManager
 * @dev This acts as proxy and implementation contract.
 * It accepts a specified token and sends it to a
 * user-provided destination address.
 */
error InvalidAddress(string); // dev: Address cannot be zero
error InvalidAmount(); // dev: Amount must be greater than zero
error AmlSignatureExpired(); // dev: AML signature has expired
error AmlSignatureAlreadyUsed(); // dev: AML signature has already been used
error InvalidAmlSignature(); // dev: The AML signature is invalid
error InvalidAmlSigner(); // dev: The AML signer is invalid
error InvalidFunctionName(); // dev: The function name is invalid
error AmountMustBeGreaterThanZero(); // dev: Amount must be greater than zero
error InsufficientBalance(); // dev: Contract does not have enough tokens to burn
error InvalidMintTransactionHash(); // dev: The mint transaction hash is invalid

/**
 * @title CrossChainManager Contract
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
    using SafeERC20 for ICustomToken;

    // --- Constants ---
    /// @notice Role for burning locked tokens.
    bytes32 private constant BURN_ADMIN_ROLE = keccak256("BURN_ADMIN_ROLE");

    /// @notice Role for burning locked tokens.
    bytes32 private constant BURN_ROLE = keccak256("BURN_ROLE");

    /// @dev Internal identifier for Deposit operations to route signature verification.
    bytes32 private constant DEPOSIT_HASH = keccak256("Deposit");

    /// @dev Internal identifier for Withdraw operations to route signature verification.
    bytes32 private constant WITHDRAW_HASH = keccak256("Withdraw");

    /// @dev EIP-712 Typehash for the Deposit struct. Defines field names and types.
    bytes32 private constant DEPOSIT_TYPEHASH = keccak256("Deposit(address sender,uint256 amount,address destinationAddress,uint256 deadline)");

    /// @dev EIP-712 Typehash for the Withdraw struct. Defines field names and types.
    bytes32 private constant WITHDRAW_TYPEHASH = keccak256("Withdraw(address sender,uint256 amount,address destinationAddress,uint256 deadline)");

    /// @dev EIP-712 Typehash for the Domain Separator. Used to prevent cross-contract/cross-chain replays.
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // --- State Variables ---

    /// @notice The token that can be managed into this contract.
    CustomToken public token;

    /// @notice The token that can be deposited into this contract.
    CrossChainVault public crossChainVault;

    /// @notice The address of the share token, used for event emissions.
    ICustomToken public shareToken;

    /// @notice The address of the trusted signer for AML (Anti-Money Laundering) checks.
    address public amlSigner;

    /// @notice List of all allowed destination addresses.
    address[] public destinationAddresses;

    /// @notice Mapping to check if an address is a destination.
    mapping(address => bool) public isDestination;

    /// @notice Mapping to track used AML signatures to prevent replay attacks.
    mapping(bytes32 => bool) public usedSignatures;

    /// @notice Mapping from address to (index in whitelist array + 1)
    mapping(address => uint256) private addressToIndex;

    // --- Events ---

    /**
     * @notice Emitted when a depositor is initialized.
     * @param tokenAddress The address of the deposit token.
     * @param shareTokenAddress The address of the withdrawal token.
     * @param amlSignerAddress The address of the AML signer.
     * @param crossChainVaultAddress The address of the cross chain vault.
     */
    event CrossChainManagerInitialized(
        address indexed tokenAddress,
        address shareTokenAddress,
        address amlSignerAddress,
        address crossChainVaultAddress
    );

    /**
     * @notice Emitted when cross chain config is updated.
     * @param from The address of the old cross chain vault.
     * @param to The address of the new cross chain vault.
     */
    event CrossChainConfigUpdated(
        address indexed from,
        address indexed to
    );

    /**
     * @notice Emitted when aml signer address is updated.
     * @param from The address of the old aml signer.
     * @param to The address of the new aml signer.
     */
    event AmlSignerUpdated(
        address indexed from,
        address indexed to
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

    /**
     * @notice Emitted when a withdrawal is made.
     * @param user The address of the user who initiated the withdrawal.
     * @param amount The amount of tokens withdrawn.
     * @param shareToken The address of the shared token associated with the withdrawal.
     * @param paymentToken The address of the payment token associated with the withdrawal.
     */
    event Withdrawn(
        address indexed user,
        uint256 amount,
        address shareToken,
        address paymentToken
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

    /**
     * @notice Emitted when tokens are burned from the contract.
     * @param amount The amount of tokens burned.
     * @param shareToken The shared token address.
     * @param burner The address that initiated the burn.
     * @param mintTransactionHash The hash of the mint transaction.
     */
    event TokensBurned(uint256 amount, address shareToken, address burner, string indexed mintTransactionHash);


    /// @custom:oz-upgrades-unsafe-allow constructor
    /// @notice constructor
    constructor() {
        _disableInitializers();
    }

    // --- Initializer ---

    /**
     * @notice Initializes the contract with the provided token addresses and AML signer.
     * @dev Can only be called once during contract deployment.
     * @param _tokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @param crossChainVaultAddress The address of the cross chain vault.
     */
    function initialize(
        address _tokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress,
        address crossChainVaultAddress
    ) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender); // Ownable2Step uses this internal call
        __AccessControl_init();
        __ReentrancyGuard_init();

        if (_tokenAddress == address(0)) revert InvalidAddress("token");
        if (_shareTokenAddress == address(0)) revert InvalidAddress("share token");
        if (_amlSignerAddress == address(0)) revert InvalidAddress("aml signer");
        if (crossChainVaultAddress == address(0)) revert InvalidAddress("cross chain vault");

        token = CustomToken(_tokenAddress);
        shareToken = ICustomToken(_shareTokenAddress);
        amlSigner = _amlSignerAddress;
        crossChainVault = CrossChainVault(crossChainVaultAddress);

        _setRoleAdmin(BURN_ROLE, BURN_ADMIN_ROLE);
        _grantRole(BURN_ADMIN_ROLE, msg.sender);

        emit CrossChainManagerInitialized(
            _tokenAddress,
            _shareTokenAddress,
            _amlSignerAddress,
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
    ) external onlyOwner {
        if (crossChainVaultAddress == address(0)) revert InvalidAddress("cross chain vault");

        address oldcrossChainVaultAddress = address(crossChainVault);
        crossChainVault = CrossChainVault(crossChainVaultAddress);

        emit CrossChainConfigUpdated(oldcrossChainVaultAddress, crossChainVaultAddress);
    }

    /**
     * @notice Updates the aml signer address.
     * @dev Can only be called by the destination manager.
     * @param amlSignerAddress The aml signer address.
     */
    function updateAmlSigner(
        address amlSignerAddress
    ) external onlyOwner {
        if (amlSignerAddress == address(0)) revert InvalidAddress("aml signer");

        address oldAmlSigner = amlSigner;
        amlSigner = amlSignerAddress;

        emit AmlSignerUpdated(oldAmlSigner, amlSignerAddress);
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
        bytes32 messageHash = _getMessageHash("Deposit", _amount, _destinationAddress, _amlDeadline);
        _verifyAML("Depositor", messageHash, _amlSignature, _amlDeadline);

        _doDeposit(_amount, _destinationAddress, targetChain, targetDomain, executorArgs, feeArgs);
    }

    /**
     * @notice Allows a user to withdraw tokens after passing an AML check.
     * @dev The function verifies the AML signature and deadline before processing the withdrawal.
     * @param _amount The amount of tokens to withdraw.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The signature from the AML signer.
     * @param _amlDeadline The expiration timestamp for the AML signature.
     */
    function withdraw(
        uint256 _amount, 
        address _destinationAddress,
        bytes calldata _amlSignature, 
        uint256 _amlDeadline
    ) external nonReentrant {
        if (_amount == 0) revert AmountMustBeGreaterThanZero();

        bytes32 messageHash = _getMessageHash("Withdraw", _amount, _destinationAddress, _amlDeadline);
        _verifyAML("Withdrawal", messageHash, _amlSignature, _amlDeadline);

        _doWithdraw(_amount);
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
    ) external payable nonReentrant {
        bytes32 messageHash = _getMessageHash("Deposit", _amount, _destinationAddress, _amlDeadline);
        _verifyAML("Depositor", messageHash, _amlSignature, _amlDeadline);

        // This call will fail if the signature is invalid or deadline passed.
        token.permit(
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
     * @notice Withdraws tokens using an off-chain 'permit' signature.
     * @dev This allows for a single-transaction approve+withdraw.
     * @param _amount The amount of tokens to withdraw.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v The recovery byte of the EIP-712 permit signature.
     * @param _r First 32 bytes of the EIP-712 permit signature.
     * @param _s Second 32 bytes of the EIP-712 permit signature.
     */
    function withdrawWithPermit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        bytes32 messageHash = _getMessageHash("Withdraw", _amount, _destinationAddress, _amlDeadline);
        _verifyAML("Withdrawal", messageHash, _amlSignature, _amlDeadline);

        // This call will fail if the signature is invalid or deadline passed.
        shareToken.permit(
            msg.sender, // The user (owner)
            address(this), // The spender (this contract)
            _amount, // The amount
            _permitDeadline, // Expiration
            _v,
            _r,
            _s // The user's signature
        );

        _doWithdraw(_amount);
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
     * @notice Adds a destination address to the array only if it doesn't already exist.
     * @dev Adds a destination address to the array only if it doesn't already exist.
     * @param _destination The address to attempt to add.
     */
    function addDestinationAddress(address _destination) external onlyOwner {
        if (_destination == address(0)) revert InvalidAddress("zero destination address");

        if (isDestination[_destination]) {
            emit DestinationAddressSkipped(_destination);
            return;
        }

        isDestination[_destination] = true;
        destinationAddresses.push(_destination);

        // Store the index + 1 (so index 0 is at 1)
        addressToIndex[_destination] = destinationAddresses.length; 

        emit DestinationAddressAdded(_destination);
    }

    /**
     * @notice Removes a destination address from the array.
     * @dev Removes a destination address from the array.
     * Note: This changes the order of the array (swap and pop) for gas efficiency.
     * @param _destination The address to remove.
     */
    function removeDestinationAddress(address _destination) external onlyOwner() {
        if (!isDestination[_destination]) {
            emit DestinationAddressSkipped(_destination);
            return;
        }

        uint256 indexPlusOne = addressToIndex[_destination];
        uint256 indexToRemove = indexPlusOne - 1;
        uint256 lastIndex = destinationAddresses.length - 1;

        if (indexToRemove != lastIndex) {
            address lastAddr = destinationAddresses[lastIndex];
            
            // Move the last element into the gap
            destinationAddresses[indexToRemove] = lastAddr;
            
            // Update the index of the moved element
            addressToIndex[lastAddr] = indexPlusOne;
        }

        // Clean up
        destinationAddresses.pop();
        delete addressToIndex[_destination];
        delete isDestination[_destination];

        emit DestinationAddressRemoved(_destination);
    }

    /**
     * @notice Burns a specified amount of tokens held by this contract.
     * @dev Only callable by addresses with the admin. This function is part of the
     * manual burn/mint model to maintain token supply across different chains.
     * @param amount The amount of tokens to burn. Must be greater than zero and not exceed
     * the contract's token balance.
     * @param mintTransactionHash The hash of the mint transaction.
     * @custom:requirements
     * - Caller must have admin
     * - `amount` must be greater than zero
     * - `mintTransactionHash` must not be empty
     * - Contract must have sufficient token balance
     */
    function burn(uint256 amount, string calldata mintTransactionHash) external onlyRole(BURN_ROLE) {
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        if (bytes(mintTransactionHash).length == 0) revert InvalidMintTransactionHash();

        // Ensure the contract has enough tokens to burn
        uint256 contractBalance = shareToken.balanceOf(address(this));
        if (amount > contractBalance) revert InsufficientBalance();

        // Burn the tokens using the CustomToken's burnAuthorized function
        shareToken.burn(amount);

        emit TokensBurned(amount, address(shareToken), msg.sender, mintTransactionHash);
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
        if (_destinationAddress == address(0)) revert InvalidAddress("destination is zero");
        if (!isDestination[_destinationAddress]) revert InvalidAddress("destination doesn't exist");

        // Pull tokens from the user to this contract
        token.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve the Vault to spend the tokens just pulled
        token.forceApprove(address(crossChainVault), _amount);

        // Calling the vault
        crossChainVault.sendTokens{value: msg.value}(
            address(token), 
            _amount, 
            targetChain, 
            targetDomain, 
            bytes32(uint256(uint160(_destinationAddress))),
            executorArgs,
            feeArgs
        );

        emit Deposited(
            msg.sender, 
            _amount, 
            address(token), 
            address(shareToken), 
            _destinationAddress, 
            targetChain
        );
    }

    /**
     * @notice Handles the withdrawal logic by transferring tokens from the sender to this contract.
     * @param _amount The amount of tokens to withdraw.
     */
    function _doWithdraw(uint256 _amount) private {
        if (_amount == 0) revert InvalidAmount();

        // transfer share tokens to the contract address
        shareToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Withdrawn(
            msg.sender, 
            _amount, 
            address(shareToken), 
            address(token) 
        );
    }

    /**
     * @notice Internal function to verify the AML signature.
     * @dev This function is called by the public deposit and depositWithPermit functions.
     * @param _name The name of the function.
     * @param messageHash The hash of the message to verify.
     * @param _signature The signature to verify.
     * @param _deadline The expiration timestamp for the signature.
     */
    function _verifyAML(string memory _name, bytes32 messageHash, bytes calldata _signature, uint256 _deadline) private {
        if (block.timestamp > _deadline) revert AmlSignatureExpired();
        if (usedSignatures[messageHash]) revert AmlSignatureAlreadyUsed();

        bytes32 ethSignedHash = MessageHashUtils.toTypedDataHash(_getDomainSeparator(_name), messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        if (recoveredSigner == address(0)) revert InvalidAmlSignature();
        if (recoveredSigner != amlSigner) revert InvalidAmlSigner();

        usedSignatures[messageHash] = true;
    }

    /**
     * @notice Returns the domain separator for the current chain.
     * @param _name The name of the function.
     * @return The domain separator for the current chain.
     */
    function _getDomainSeparator(string memory _name) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes(_name)),
                    keccak256("1"),
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @notice Calculates the hash of the struct using abi.encode (standard EIP-712).
     * @param _name The name of the function.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _deadline The expiration timestamp for the signature.
     * @return The hash of the struct.
     */
    function _getMessageHash(
        string memory _name,
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        bytes32 nameHash = keccak256(bytes(_name));

        if (nameHash == DEPOSIT_HASH) {
            return keccak256(abi.encode(DEPOSIT_TYPEHASH, msg.sender, _amount, _destinationAddress, _deadline));
        } else if (nameHash == WITHDRAW_HASH) {
            return keccak256(abi.encode(WITHDRAW_TYPEHASH, msg.sender, _amount, _destinationAddress, _deadline));
        }

        revert InvalidFunctionName();
    }

    // --- Upgrade Safety ---
    // 8 slots: token, crossChainVault, shareToken, amlSigner, destinationAddresses, isDestination, usedSignatures, addressToIndex
    // reentrancyStatus slot is namespaced
    uint256[42] private __gap;

    /**
     * @notice Authorizes a contract upgrade.
     * @dev Only callable by the owner.
     * @param newImplementation Address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Upgrade authorized
    }
}

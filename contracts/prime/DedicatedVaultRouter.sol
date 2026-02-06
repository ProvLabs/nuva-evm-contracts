// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// Interface for the Disposable Proxy we deploy
interface IRedemptionProxy {
    function initialize(address _assetVault, address _stakingVault, address _receiver) external;

    function triggerRedeem(uint256 _amountStakingShares) external returns (uint256 requestId);

    function sweep(uint256 _amount) external returns (uint256);
}

contract DedicatedVaultRouter is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // --- State Variables ---
    IERC4626 public assetVault;
    IERC20 public asset;
    IERC4626 public stakingVault;
    IERC20 public stakingAsset;
    IERC4626 public nuvaVault; // New: Nuva Vault
    IERC20 public nuvaAsset; // New: Nuva Asset
    address public amlSigner;

    mapping(bytes32 => bool) public usedSignatures;

    // --- Events ---
    event Deposited(address indexed user, uint256 assets, uint256 shares, uint256 stakingShares, uint256 nuvaShares);
    event NuvaDeposited(address indexed user, uint256 stakingShares, uint256 nuvaShares); // New: Nuva Deposited event
    event AmlSignerUpdated(address indexed oldSigner, address indexed newSigner);

    // --- Custom Errors ---
    error InvalidVault();
    error InvalidAmlSigner();
    error AmlSignatureExpired();
    error AmlSignatureAlreadyUsed();
    error InvalidAmlSignature();
    error FundsStuck(uint256 amount);
    error SlippageExceeded(uint256 minShares, uint256 actualShares);

    bytes32 private constant DEPOSIT_TYPEHASH =
        keccak256(
            "Deposit(address sender,uint256 amount,address receiver,uint256 minVaultShares,uint256 minStakingShares,uint256 minNuvaVaultShares,uint256 deadline)"
        );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _assetVault,
        address _stakingVault,
        address _nuvaVault, // New: Nuva Vault address
        address _amlSigner,
        address _initialOwner
    ) public initializer {
        __UUPSUpgradeable_init_unchained();
        __Ownable_init_unchained(_initialOwner);
        __Ownable2Step_init_unchained();
        __ReentrancyGuard_init_unchained(); // Initialized

        if (_assetVault == address(0) || _stakingVault == address(0) || _nuvaVault == address(0)) revert InvalidVault(); // Updated validation
        if (_amlSigner == address(0)) revert InvalidAmlSigner();

        assetVault = IERC4626(_assetVault);
        asset = IERC20(assetVault.asset());

        stakingVault = IERC4626(_stakingVault);
        stakingAsset = IERC20(stakingVault.asset());

        nuvaVault = IERC4626(_nuvaVault); // New: Set nuvaVault
        nuvaAsset = IERC20(nuvaVault.asset()); // New: Set nuvaAsset

        amlSigner = _amlSigner;
    }

    function deposit(
        uint256 _amount,
        address _receiver,
        uint256 _minVaultSharesOut,
        uint256 _minStakingVaultSharesOut,
        uint256 _minNuvaVaultSharesOut, // New: Min Nuva Vault Shares
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external nonReentrant returns (uint256) {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _receiver,
            _minVaultSharesOut,
            _minStakingVaultSharesOut,
            _minNuvaVaultSharesOut, // New: Pass to _getMessageHash
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        return _doDeposit(_amount, _receiver, _minVaultSharesOut, _minStakingVaultSharesOut, _minNuvaVaultSharesOut); // New: Pass to _doDeposit
    }

    /**
     * @notice UX-focused deposit including AML, Permit, and Auto-Staking.
     */
    function depositWithPermit(
        uint256 _amount,
        address _receiver,
        uint256 _minVaultSharesOut,
        uint256 _minStakingVaultSharesOut,
        uint256 _minNuvaVaultSharesOut, // New: Min Nuva Vault Shares
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant returns (uint256) {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _receiver,
            _minVaultSharesOut,
            _minStakingVaultSharesOut,
            _minNuvaVaultSharesOut, // New: Pass to _getMessageHash
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        try
            IERC20Permit(address(asset)).permit(msg.sender, address(this), _amount, _permitDeadline, _v, _r, _s)
        {} catch {}

        return _doDeposit(_amount, _receiver, _minVaultSharesOut, _minStakingVaultSharesOut, _minNuvaVaultSharesOut); // New: Pass to _doDeposit
    }

    function _doDeposit(
        uint256 _amount,
        address _receiver,
        uint256 _minVaultSharesOut,
        uint256 _minStakingVaultSharesOut,
        uint256 _minNuvaVaultSharesOut // New: Min Nuva Vault Shares
    ) internal returns (uint256 nuvaShares) {
        uint256 assetBalBefore = asset.balanceOf(address(this));
        uint256 stakingAssetBalBefore = stakingAsset.balanceOf(address(this));
        uint256 nuvaAssetBalBefore = nuvaAsset.balanceOf(address(this)); // New: Nuva Asset balance before

        // 1. Asset Vault Hop
        asset.safeTransferFrom(msg.sender, address(this), _amount);

        asset.forceApprove(address(assetVault), _amount);
        uint256 vaultShares = assetVault.deposit(_amount, address(this));

        if (vaultShares < _minVaultSharesOut) revert SlippageExceeded(_minVaultSharesOut, vaultShares);
        if (asset.balanceOf(address(this)) > assetBalBefore) revert FundsStuck(1); // Changed error code

        // 2. Staking Vault Hop
        stakingAsset.forceApprove(address(stakingVault), vaultShares);
        uint256 stakingShares = stakingVault.deposit(vaultShares, address(this)); // Deposit to router itself for next hop

        if (stakingShares < _minStakingVaultSharesOut)
            revert SlippageExceeded(_minStakingVaultSharesOut, stakingShares);
        if (stakingAsset.balanceOf(address(this)) > stakingAssetBalBefore) revert FundsStuck(2); // Changed error code

        // 3. Nuva Vault Hop (New)
        nuvaAsset.forceApprove(address(nuvaVault), stakingShares);
        nuvaShares = nuvaVault.deposit(stakingShares, _receiver);

        if (nuvaShares < _minNuvaVaultSharesOut)
            revert SlippageExceeded(_minNuvaVaultSharesOut, nuvaShares);
        if (nuvaAsset.balanceOf(address(this)) > nuvaAssetBalBefore) revert FundsStuck(3); // Changed error code

        emit Deposited(msg.sender, _amount, vaultShares, stakingShares, nuvaShares); // Updated event
        emit NuvaDeposited(msg.sender, stakingShares, nuvaShares); // New event
    }

    // --- Admin Functions ---

    function setAmlSigner(address _newAmlSigner) external onlyOwner {
        if (_newAmlSigner == address(0)) revert InvalidAmlSigner();
        emit AmlSignerUpdated(amlSigner, _newAmlSigner);
        amlSigner = _newAmlSigner;
    }

    // --- Internal Helpers ---

    function _verifyAML(bytes32 _messageHash, bytes calldata _signature, uint256 _deadline) private {
        if (block.timestamp > _deadline) revert AmlSignatureExpired();
        if (usedSignatures[_messageHash]) revert AmlSignatureAlreadyUsed();

        bytes32 ethSignedHash = MessageHashUtils.toTypedDataHash(_getDomainSeparator(), _messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        if (recoveredSigner != amlSigner) revert InvalidAmlSignature();
        usedSignatures[_messageHash] = true;
    }

    function _getMessageHash(
        uint256 _amount,
        address _receiver,
        uint256 _minVaultShares,
        uint256 _minStakingShares,
        uint256 _minNuvaVaultShares, // New: Min Nuva Vault Shares
        uint256 _deadline
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DEPOSIT_TYPEHASH,
                    msg.sender,
                    _amount,
                    _receiver,
                    _minVaultShares,
                    _minStakingShares,
                    _minNuvaVaultShares, // New: Include in encoding
                    _deadline
                )
            );
    }

    function _getDomainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256(bytes("DedicatedVaultRouter")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    // --- Upgrade Safety ---
    // 7 slots: assetVault, asset, stakingVault, stakingAsset, nuvaVault, nuvaAsset, amlSigner
    // reentrancyStatus slot is namespaced
    uint256[43] private __gap;

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}

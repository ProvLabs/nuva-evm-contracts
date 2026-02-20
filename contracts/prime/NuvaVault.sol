// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title NuvaVault
 * @notice A professional-grade ERC4626 vault implementation.
 * @dev Features UUPS upgradeability, inflation attack protection via offsets, pausable operations, and multi-step ownership.
 * @author Nuva Finance
 */
contract NuvaVault is
    Initializable,
    ERC4626Upgradeable,
    ERC20PermitUpgradeable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // --- Custom Errors ---
    /// @notice Thrown when the provided asset address is invalid (zero address).
    error InvalidAsset();

    /**
     * @custom:oz-upgrades-unsafe-allow constructor
     * @notice Constructor to disable initializers for the logic contract.
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the vault with asset and naming information.
     * @param _asset The underlying asset of the vault.
     * @param _name The name of the vault token.
     * @param _symbol The symbol of the vault token.
     * @param _initialOwner The address of the initial contract owner.
     */
    function initialize(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) public initializer {
        if (_asset == address(0)) revert InvalidAsset();

        __ERC20_init(_name, _symbol);
        __ERC4626_init(IERC20(_asset));
        __ERC20Permit_init(_name);
        __Ownable_init_unchained(_initialOwner);
        __Ownable2Step_init_unchained();
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
    }

    // --- Admin Functions ---

    /**
     * @notice Pauses vault operations (deposits, mints, withdrawals, redemptions).
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses vault operations.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Authorizes a contract upgrade. Only callable by the owner.
     * @param newImplementation The address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Overrides ---

    /**
     * @notice Deposits assets into the vault. Protected by whenNotPaused.
     * @param assets Amount of assets to deposit.
     * @param receiver Address to receive the shares.
     * @return shares Amount of shares minted.
     */
    function deposit(uint256 assets, address receiver) public override whenNotPaused returns (uint256 shares) {
        return super.deposit(assets, receiver);
    }

    /**
     * @notice Mints shares from the vault. Protected by whenNotPaused.
     * @param shares Amount of shares to mint.
     * @param receiver Address to receive the shares.
     * @return assets Amount of assets deposited.
     */
    function mint(uint256 shares, address receiver) public override whenNotPaused returns (uint256 assets) {
        return super.mint(shares, receiver);
    }

    /**
     * @notice Withdraws assets from the vault. Protected by whenNotPaused.
     * @param assets Amount of assets to withdraw.
     * @param receiver Address to receive the assets.
     * @param owner Address of the owner of the shares.
     * @return shares Amount of shares burned.
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 shares) {
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @notice Redeems shares from the vault. Protected by whenNotPaused.
     * @param shares Amount of shares to redeem.
     * @param receiver Address to receive the assets.
     * @param owner Address of the owner of the shares.
     * @return assets Amount of assets withdrawn.
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused returns (uint256 assets) {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Returns the decimals offset used to protect against inflation attacks.
     * @return The number of virtual decimals to add.
     */
    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     * @return The number of decimals.
     */
    function decimals() public view virtual override(ERC4626Upgradeable, ERC20Upgradeable) returns (uint8) {
        return super.decimals();
    }

    // --- Upgrade Safety ---
    /// @dev Storage gap for future expansion.
    uint256[50] private __gap;
}

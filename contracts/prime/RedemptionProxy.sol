// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface IAsyncRedemptionVault is IERC4626 {
    function requestRedeem(uint256 shares) external;
}

/**
 * @title RedemptionProxy
 * @notice Disposable proxy contract deployed via EIP-1167 Clones.
 * @dev Handles the async redemption flow for a single batch of users to isolate accounting.
 */
contract RedemptionProxy is Initializable {
    using SafeERC20 for IERC20;

    // --- State Variables ---
    address public router;
    address public user;

    // The "Inner" Vault (e.g. YLDS) - Holds the USDC
    IAsyncRedemptionVault public assetVault;

    // The "Outer" Vault (e.g. Staking Wrapper) - Holds the AssetVault Shares
    IERC4626 public stakingVault;
    IERC20 public stakingAsset; // NEW: Staking Asset for consistency

    // The "Nuva" Vault - Holds the StakingVault Shares
    IERC4626 public nuvaVault; // NEW
    IERC20 public nuvaAsset; // NEW

    // The Underlying Asset (e.g. USDC)
    IERC20 public asset;

    // --- Custom Errors ---
    error InvalidConfiguration();
    error OnlyRouter();
    error FundsStuck();
    error TransferFailed();
    error InsufficientBalance();

    // --- Modifiers ---
    modifier onlyRouter() {
        if (msg.sender != router) revert OnlyRouter();
        _;
    }

    // --- Initialization ---
    function initialize(address _assetVault, address _stakingVault, address _nuvaVault, address _user) external initializer {
        // Validation: Ensure critical addresses are set
        if (_assetVault == address(0) || _stakingVault == address(0) || _nuvaVault == address(0) || _user == address(0)) { // UPDATED validation
            revert InvalidConfiguration();
        }

        router = msg.sender;
        user = _user;

        assetVault = IAsyncRedemptionVault(_assetVault);
        stakingVault = IERC4626(_stakingVault);
        nuvaVault = IERC4626(_nuvaVault); // NEW: Set nuvaVault

        // Cache the underlying tokens for cheaper access later
        asset = IERC20(assetVault.asset());
        stakingAsset = IERC20(stakingVault.asset()); // NEW: Cache stakingAsset
        nuvaAsset = IERC20(nuvaVault.asset()); // NEW: Cache nuvaAsset
    }

    // --- Core Logic ---

    /**
     * @notice Unwinds NuvaShares -> StakingShares -> AssetShares -> RequestRedeem (Async Lock)
     * @param _amountNuvaShares Amount of Nuva Vault shares to redeem
     */
    function triggerRedeem(uint256 _amountNuvaShares) external onlyRouter {
        // Snapshots for post-condition checks
        uint256 nuvaBalBefore = IERC20(address(nuvaVault)).balanceOf(address(this));
        uint256 stakingBalBefore = IERC20(address(stakingVault)).balanceOf(address(this));
        uint256 assetSharesBalBefore = IERC20(address(assetVault)).balanceOf(address(this));

        // 1. Pull Nuva Vault Shares from Router
        IERC20(address(nuvaVault)).safeTransferFrom(msg.sender, address(this), _amountNuvaShares);

        // 2. Redeem Nuva Shares -> StakingVault Shares
        // Standard 4626 redeem burns shares from 'owner' (this proxy)
        uint256 amountStakingShares = nuvaVault.redeem(_amountNuvaShares, address(this), address(this));

        // CHECK 1: Ensure Nuva Shares were actually consumed
        if (IERC20(address(nuvaVault)).balanceOf(address(this)) > nuvaBalBefore) {
            revert FundsStuck();
        }

        // 2. Redeem Staking Shares -> AssetVault Shares
        // Approve StakingVault to take its own shares back
        IERC20(address(stakingVault)).forceApprove(address(stakingVault), amountStakingShares);
        uint256 amountAssetShares = stakingVault.redeem(amountStakingShares, address(this), address(this));

        // CHECK 2: Ensure Staking Shares were actually consumed
        if (IERC20(address(stakingVault)).balanceOf(address(this)) > stakingBalBefore) {
            revert FundsStuck();
        }

        // 3. Request Redeem on AssetVault
        // Approve AssetVault to take its own shares back
        IERC20(address(assetVault)).forceApprove(address(assetVault), amountAssetShares);
        assetVault.requestRedeem(amountAssetShares);

        // CHECK 3: Ensure AssetVault actually took the shares
        if (IERC20(address(assetVault)).balanceOf(address(this)) > assetSharesBalBefore) {
            revert FundsStuck();
        }
    }

    /**
     * @notice Sweeps exact amount of USDC to the user.
     * @dev Leaves excess funds (dust/tainted) behind in the proxy.
     * @param _amount The exact amount expected from the Admin payout.
     */
    function sweep(uint256 _amount) external onlyRouter returns (uint256) {
        uint256 balBefore = asset.balanceOf(address(this));

        // 1. Pre-Check: Do we actually have the funds?
        if (balBefore < _amount) revert InsufficientBalance();

        if (_amount > 0) {
            // 2. Perform Transfer
            asset.safeTransfer(user, _amount);

            // 3. Post-Check: Did the balance actually decrease by the expected amount?
            // This catches "Fee-on-Transfer" tokens or "Phantom Success" bugs.
            uint256 balAfter = asset.balanceOf(address(this));
            if (balBefore - balAfter != _amount) revert TransferFailed();
        }

        return _amount;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title IAsyncRedemptionVault
 * @notice Interface for a vault that supports asynchronous redemption requests.
 */
interface IAsyncRedemptionVault is IERC4626 {
    /**
     * @notice Requests a redemption of shares for the underlying asset.
     * @param shares The amount of shares to redeem.
     */
    function requestRedeem(uint256 shares) external;
}

/**
 * @title RedemptionProxy
 * @notice Disposable proxy contract deployed via EIP-1167 Clones.
 * @dev Handles the async redemption flow for a single batch of users to isolate accounting.
 * @author Nuva Finance
 */
contract RedemptionProxy is Initializable {
    using SafeERC20 for IERC20;

    // --- State Variables ---
    /// @notice The address of the DedicatedVaultRouter that deployed this proxy.
    address public router;

    /// @notice The address of the user who initiated the redemption.
    address public user;

    /// @notice The "Inner" Vault (e.g. YLDS) - Holds the USDC
    IAsyncRedemptionVault public assetVault;

    /// @notice The "Outer" Vault (e.g. Staking Wrapper) - Holds the AssetVault Shares
    IERC4626 public stakingVault;

    /// @notice The asset required for staking in the stakingVault.
    IERC20 public stakingAsset;

    /// @notice The "Nuva" Vault - Holds the StakingVault Shares
    IERC4626 public nuvaVault;

    /// @notice The asset required for the nuvaVault.
    IERC20 public nuvaAsset;

    /// @notice The underlying base asset (e.g. USDC).
    IERC20 public asset;

    // --- Custom Errors ---
    error InvalidConfiguration();
    error OnlyRouter();
    error FundsStuck();
    error TransferFailed();
    error InsufficientBalance();
    error InvalidAmount();

    // --- Modifiers ---
    modifier onlyRouter() {
        if (msg.sender != router) revert OnlyRouter();
        _;
    }

    // --- Initialization ---

    /**
     * @notice Initializes the proxy with vault and user information.
     * @param _assetVault The address of the asynchronous redemption vault.
     * @param _stakingVault The address of the staking vault.
     * @param _nuvaVault The address of the Nuva vault.
     * @param _user The address of the user receiving the redeemed assets.
     */
    function initialize(
        address _assetVault,
        address _stakingVault,
        address _nuvaVault,
        address _user
    ) external initializer {
        if (
            _assetVault == address(0) || _stakingVault == address(0) || _nuvaVault == address(0) || _user == address(0)
        ) {
            revert InvalidConfiguration();
        }

        router = msg.sender;
        user = _user;

        assetVault = IAsyncRedemptionVault(_assetVault);
        stakingVault = IERC4626(_stakingVault);
        nuvaVault = IERC4626(_nuvaVault);

        asset = IERC20(assetVault.asset());
        stakingAsset = IERC20(stakingVault.asset());
        nuvaAsset = IERC20(nuvaVault.asset());
    }

    // --- Core Logic ---

    /**
     * @notice Unwinds NuvaShares -> StakingShares -> AssetShares -> RequestRedeem (Async Lock)
     * @param _amountNuvaShares Amount of Nuva Vault shares to redeem
     */
    function triggerRedeem(uint256 _amountNuvaShares) external onlyRouter {
        uint256 nuvaBalBefore = IERC20(address(nuvaVault)).balanceOf(address(this));
        uint256 stakingBalBefore = IERC20(address(stakingVault)).balanceOf(address(this));
        uint256 assetSharesBalBefore = IERC20(address(assetVault)).balanceOf(address(this));

        if (_amountNuvaShares == 0) revert InvalidAmount();
        IERC20(address(nuvaVault)).safeTransferFrom(msg.sender, address(this), _amountNuvaShares);

        uint256 amountStakingShares = nuvaVault.redeem(_amountNuvaShares, address(this), address(this));

        if (IERC20(address(nuvaVault)).balanceOf(address(this)) > nuvaBalBefore) {
            revert FundsStuck();
        }

        uint256 amountAssetShares = stakingVault.redeem(amountStakingShares, address(this), address(this));

        if (IERC20(address(stakingVault)).balanceOf(address(this)) > stakingBalBefore) {
            revert FundsStuck();
        }

        IERC20(address(assetVault)).forceApprove(address(assetVault), amountAssetShares);
        assetVault.requestRedeem(amountAssetShares);

        if (IERC20(address(assetVault)).balanceOf(address(this)) > assetSharesBalBefore) {
            revert FundsStuck();
        }
    }

    /**
     * @notice Sweeps exact amount of USDC to the user.
     * @dev Leaves excess funds (dust/tainted) behind in the proxy.
     * @param _amount The exact amount expected from the Admin payout.
     * @return sweptAmount The actual amount of assets swept to the user.
     */
    function sweep(uint256 _amount) external onlyRouter returns (uint256 sweptAmount) {
        uint256 balBefore = asset.balanceOf(address(this));

        if (balBefore < _amount) revert InsufficientBalance();

        if (_amount > 0) {
            asset.safeTransfer(user, _amount);

            uint256 balAfter = asset.balanceOf(address(this));
            if (balBefore - balAfter != _amount) revert TransferFailed();
        }

        return _amount;
    }
}

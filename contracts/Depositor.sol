// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Depositor
 * @dev This is the LOGIC contract. It will be "cloned" by the factory.
 * It accepts a specified token (depositToken) and sends it to a
 * user-provided destination address.
 */
contract Depositor is Initializable {

    // --- State Variables ---

    /**
     * @notice The ERC20 token contract to be deposited (e.g., USDC, USDT).
     */
    IERC20 public depositToken; // <--- RENAMED

    /**
     * @notice The ERC20 token address to be emitted in the deposit event.
     */
    address public shareToken;

    // --- Events ---

    event Deposit(
        address indexed user,
        uint256 amount,
        address indexed shareToken,
        address indexed destinationAddress
    );

    // --- Initializer ---

    /**
     * @dev Initializer. Replaces the constructor.
     * @param _depositTokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     */
    function initialize( // <--- PARAM RENAMED
        address _depositTokenAddress,
        address _shareTokenAddress
    ) external initializer {
        require(_depositTokenAddress != address(0), "Deposit token address cannot be zero");
        require(_shareTokenAddress != address(0), "Reward token address cannot be zero");

        depositToken = IERC20(_depositTokenAddress); // <--- RENAMED
        shareToken = _shareTokenAddress;
    }

    // --- Public Functions ---

    /**
     * @notice Allows a user to deposit a specific amount of `depositToken`.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     */
    function deposit(
        uint256 _amount,
        address _destinationAddress
    ) external {
        require(_amount > 0, "Amount must be greater than zero");
        require(_destinationAddress != address(0), "Destination cannot be zero");

        // Pull `depositToken` from the user and send to the destination
        bool success = depositToken.transferFrom( // <--- RENAMED
            msg.sender,
            _destinationAddress,
            _amount
        );
        require(success, "Token transfer failed. Check allowance.");

        emit Deposit(msg.sender, _amount, shareToken, _destinationAddress);
    }
}

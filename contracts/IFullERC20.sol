// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import the three standard interfaces we need
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title IFullERC20
 * @dev This interface combines the most common ERC20 extensions
 * into a single interface for easier use in scripts.
 */
interface IFullERC20 is IERC20, IERC20Metadata, IERC20Permit {
    // This interface is now "full" and has all the functions
    // we need, like .balanceOf(), .name(), and .nonces()
}

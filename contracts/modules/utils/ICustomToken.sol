// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
}

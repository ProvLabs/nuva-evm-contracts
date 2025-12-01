// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CustomToken} from "./CustomToken.sol";

/**
 * @title Token Factory Contract
 * @notice Creates and manages custom ERC20 tokens.
 * @author NU Blockchain Technologies
 */
contract TokenFactory is Ownable {
    using SafeERC20 for IERC20;
    /**
     * @notice Array of all created tokens.
     */
    address[] public allTokens;

    /**
     * @notice Emitted when a new token is created.
     * @param tokenAddress The address of the created token.
     * @param name The name of the created token.
     * @param symbol The symbol of the created token.
     * @param decimals The number of decimals for the created token.
     * @param owner The owner of the created token.
     */
    event TokenCreated(address indexed tokenAddress, string name, string symbol, uint8 decimals, address indexed owner);

    // --- Constructor ---

    /**
     * @notice Initializes the contract.
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Creates a new custom ERC20 token.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _decimals The number of decimals for the token.
     */
    function createToken(string calldata _name, string calldata _symbol, uint8 _decimals) external onlyOwner {
        CustomToken token = new CustomToken(_name, _symbol, msg.sender, _decimals);
        allTokens.push(address(token));
        emit TokenCreated(address(token), _name, _symbol, _decimals, msg.sender);
    }

    /**
     * @notice Returns all created tokens.
     * @return Array of all created tokens.
     */
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    /**
     * @notice Safely transfers tokens from the sender to the specified address.
     * @param token The address of the token to transfer.
     * @param to The address to which the tokens will be transferred.
     * @param amount The amount of tokens to transfer.
     */
    function safeTransferToken(address token, address to, uint256 amount) external {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Safely transfers tokens from the specified address to the specified address.
     * @param token The address of the token to transfer.
     * @param from The address from which the tokens will be transferred.
     * @param to The address to which the tokens will be transferred.
     * @param amount The amount of tokens to transfer.
     */
    function safeTransferFromToken(address token, address from, address to, uint256 amount) external {
        IERC20(token).safeTransferFrom(from, to, amount);
    }

    /**
     * @notice Safely increases the allowance for a spender to transfer tokens on behalf of the sender.
     * @param token The address of the token to transfer.
     * @param spender The address of the spender.
     * @param addedValue The amount of tokens to add to the allowance.
     */
    function safeIncreaseAllowance(address token, address spender, uint256 addedValue) external {
        IERC20(token).safeIncreaseAllowance(spender, addedValue);
    }

    /**
     * @notice Safely decreases the allowance for a spender to transfer tokens on behalf of the sender.
     * @param token The address of the token to transfer.
     * @param spender The address of the spender.
     * @param subtractedValue The amount of tokens to subtract from the allowance.
     */
    function safeDecreaseAllowance(address token, address spender, uint256 subtractedValue) external {
        IERC20(token).safeDecreaseAllowance(spender, subtractedValue);
    }

    /**
     * @notice Forces the approval of a spender to transfer tokens on behalf of the sender.
     * @param token The address of the token to transfer.
     * @param spender The address of the spender.
     * @param amount The amount of tokens to approve.
     */
    function forceApproveToken(address token, address spender, uint256 amount) external {
        IERC20(token).forceApprove(spender, amount);
    }
}

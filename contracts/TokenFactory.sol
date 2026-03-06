// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    Ownable2Step,
    Ownable
} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {CustomToken} from "./CustomToken.sol";

/**
 * @title Token Factory Contract
 * @notice Creates and manages custom ERC20 tokens.
 * @author NU Blockchain Technologies
 */
contract TokenFactory is Ownable2Step {
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
    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint8 decimals,
        address indexed owner
    );

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
    function createToken(
        string calldata _name,
        string calldata _symbol,
        uint8 _decimals
    ) external onlyOwner {
        CustomToken token = new CustomToken(
            _name,
            _symbol,
            msg.sender,
            _decimals
        );
        allTokens.push(address(token));
        emit TokenCreated(
            address(token),
            _name,
            _symbol,
            _decimals,
            msg.sender
        );
    }

    /**
     * @notice Returns all created tokens.
     * @return Array of all created tokens.
     */
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }
}

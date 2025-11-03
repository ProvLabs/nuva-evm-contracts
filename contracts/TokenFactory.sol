// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./CustomToken.sol";

/// @title Token Factory Contract
contract TokenFactory {
    using SafeERC20 for IERC20;
    address[] public allTokens;

    event TokenCreated(address tokenAddress, string name, string symbol, uint8 decimals, address owner);

    function createToken(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) external {
        CustomToken token = new CustomToken(_name, _symbol, msg.sender, _decimals);
        allTokens.push(address(token));
        emit TokenCreated(address(token), _name, _symbol, _decimals, msg.sender);
    }

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function safeTransferToken(address token, address to, uint256 amount) external {
        IERC20(token).safeTransfer(to, amount);
    }

    function safeTransferFromToken(address token, address from, address to, uint256 amount) external {
        IERC20(token).safeTransferFrom(from, to, amount);
    }

    function safeIncreaseAllowance(address token, address spender, uint256 addedValue) external {
        IERC20(token).safeIncreaseAllowance(spender, addedValue);
    }

    function safeDecreaseAllowance(address token, address spender, uint256 subtractedValue) external {
        IERC20(token).safeDecreaseAllowance(spender, subtractedValue);
    }

    function forceApproveToken(address token, address spender, uint256 amount) external {
        IERC20(token).forceApprove(spender, amount);
    }
}

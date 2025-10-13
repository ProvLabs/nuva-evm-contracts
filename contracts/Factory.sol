// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Custom ERC20 Token
contract CustomToken is ERC20 {
    address public owner;

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _owner
    ) ERC20(_name, _symbol) {
        owner = _owner;
        _mint(_owner, _initialSupply * (10 ** decimals()));
    }
}

/// @title Token Factory Contract
contract TokenFactory {
    address[] public allTokens;

    event TokenCreated(address tokenAddress, string name, string symbol, uint256 initialSupply, address owner);

    function createToken(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) external {
        CustomToken token = new CustomToken(_name, _symbol, _initialSupply, msg.sender);
        allTokens.push(address(token));
        emit TokenCreated(address(token), _name, _symbol, _initialSupply, msg.sender);
    }

    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }
}

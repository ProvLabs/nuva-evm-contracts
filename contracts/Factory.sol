// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Custom ERC20 Token
contract CustomToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    uint8 private _customDecimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _admin,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        _customDecimals = _decimals;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
        _grantRole(BURNER_ROLE, _admin);
        _mint(_admin, _initialSupply * (10 ** _decimals));
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burnAuthorized(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        return super.transfer(to, value);
    }

    function approve(address spender, uint256 value) public override returns (bool) {
        return super.approve(spender, value);
    }

    function transferChecked(address to, uint256 value) external returns (bool) {
        bool ok = super.transfer(to, value);
        require(ok, "Transfer failed");
        return ok;
    }
}

/// @title Token Factory Contract
contract TokenFactory {
    using SafeERC20 for IERC20;
    address[] public allTokens;

    event TokenCreated(address tokenAddress, string name, string symbol, uint256 initialSupply, uint8 decimals, address owner);

    function createToken(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        uint8 _decimals
    ) external {
        CustomToken token = new CustomToken(_name, _symbol, _initialSupply, msg.sender, _decimals);
        allTokens.push(address(token));
        emit TokenCreated(address(token), _name, _symbol, _initialSupply, _decimals, msg.sender);
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

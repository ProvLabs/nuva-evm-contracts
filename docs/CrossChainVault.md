# CrossChainVault Contract

## Overview

The `CrossChainVault` contract is a cross-chain token bridge application built on top of Wormhole's token bridge infrastructure. It enables users to send tokens across different blockchains with arbitrary message payloads, facilitating seamless cross-chain token transfers.

## Key Features

### 🌉 Cross-Chain Token Transfers
- **Wormhole Integration**: Leverages Wormhole's token bridge contract for secure cross-chain transfers
- **Arbitrary Messages**: Supports custom message payloads alongside token transfers
- **Multi-Chain Support**: Compatible with any blockchain supported by Wormhole
- **Circle CCTP Integration**: Uses Circle's Cross-Chain Transfer Protocol for enhanced interoperability

### 🔐 Security & Access Control
- **Role-Based Access Control**: Implements OpenZeppelin's AccessControl for fine-grained permissions
- **Whitelist System**: Only whitelisted addresses can initiate cross-chain transfers
- **Reentrancy Protection**: Built-in protection against reentrancy attacks
- **Upgrade Safety**: Uses OpenZeppelin's upgradeable pattern with proper storage gap management

### 🛠️ Technical Features
- **ERC20 Token Support**: Works with any standard ERC20 token
- **Dynamic Fee Handling**: Supports transfer fees and executor fees
- **Token Decimal Normalization**: Proper handling of tokens with different decimal places
- **Gas Optimization**: Efficient token custody and transfer mechanisms

## Contract Architecture

### Inheritance Structure
```solidity
contract CrossChainVault is 
    Initializable, 
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable
```

### Core Components

#### State Variables
- `executor`: The CCTPv1WithExecutor contract interface
- `WHITELISTED_ROLE`: Role identifier for whitelisted addresses

#### Key Functions

##### `sendTokens()`
The main function for initiating cross-chain transfers:
```solidity
function sendTokens(
    address token,
    uint256 amount,
    uint16 targetChain,
    uint32 targetDomain,
    bytes32 targetRecipient,
    ExecutorArgs calldata executorArgs,
    FeeArgs calldata feeArgs
) external payable nonReentrant onlyRole(WHITELISTED_ROLE)
```

**Parameters:**
- `token`: Address of the ERC20 token to transfer
- `amount`: Amount of tokens to transfer
- `targetChain`: Wormhole chain ID of the target blockchain
- `targetDomain`: Circle's domain ID of the target blockchain
- `targetRecipient`: Recipient address in bytes32 format
- `executorArgs`: Executor-specific arguments
- `feeArgs`: Fee-related arguments

##### `getWhitelist()`
Returns the complete list of whitelisted addresses:
```solidity
function getWhitelist() public view returns (address[] memory)
```

## Security Features

### Access Control
- **Whitelist Role**: Only addresses with `WHITELISTED_ROLE` can initiate transfers
- **Owner Management**: Two-step ownership transfer for enhanced security
- **Role Enumeration**: Ability to enumerate all members of a role

### Upgrade Safety
- **Storage Gaps**: 46 slots reserved for future upgrades
- **UUPS Pattern**: Uses Universal Upgradeable Proxy Standard
- **Proper Initialization**: Prevents initialization attacks

### Input Validation
- **Zero Address Checks**: Validates all address inputs
- **Amount Validation**: Ensures amounts are greater than zero
- **Balance Verification**: Confirms token balance changes match expected amounts

## Events

### `TokensSent`
Emitted when tokens are successfully sent cross-chain:
```solidity
event TokensSent(
    address indexed token,
    uint256 amount,
    uint16 targetChain,
    uint32 targetDomain,
    bytes32 targetRecipient,
    uint64 nonce
);
```

## Usage Example

### Prerequisites
1. Deploy the contract with a valid executor address
2. Grant `WHITELISTED_ROLE` to authorized addresses
3. Ensure the contract has sufficient ETH for Wormhole fees

### Sending Tokens Cross-Chain
```javascript
// Example JavaScript interaction
const vault = await ethers.getContractAt("CrossChainVault", vaultAddress);

// Prepare executor and fee arguments
const executorArgs = {
    // Executor-specific parameters
};

const feeArgs = {
    transferTokenFee: ethers.parseEther("0.01"),
    // Other fee parameters
};

// Send tokens
const tx = await vault.sendTokens(
    tokenAddress,                    // Token address
    ethers.parseEther("100"),        // Amount
    2,                              // Target chain (e.g., Ethereum)
    1,                              // Target domain (Circle)
    "0x1234...5678",               // Target recipient
    executorArgs,
    feeArgs,
    { value: ethers.parseEther("0.1") } // ETH for fees
);
```

## Error Handling

The contract includes comprehensive error handling with custom errors:

- `InvalidExecutorAddress`: Invalid executor contract address
- `InvalidTokenAddress`: Invalid token contract address
- `AmountMustBeGreaterThanZero`: Amount must be greater than zero
- `TargetRecipientCannotBeBytes32Zero`: Invalid target recipient
- `NormalizedAmountMustBeGreaterThanZero`: Normalized amount is zero
- `InsufficientValue`: Insufficient ETH value for fees
- `AmountMismatch`: Token balance mismatch
- `InvalidAddress`: Generic invalid address error
- `AddressNotWhitelisted`: Caller not whitelisted

## Gas Optimization

### Efficient Token Handling
- **Balance Verification**: Pre and post-transfer balance checks
- **Force Approval**: Uses `forceApprove` for gas efficiency
- **Minimal Storage**: Optimized storage layout

### Batch Operations Support
- Designed to support potential batch operations in future upgrades
- Storage gaps reserved for additional features

## Integration Requirements

### Dependencies
- OpenZeppelin Contracts Upgradeable v5.x
- Wormhole Token Bridge contracts
- Circle CCTP contracts
- Custom BytesLib utility

### Deployment Considerations
- Must be deployed behind a proxy (UUPS recommended)
- Requires proper initialization with valid executor
- ETH balance needed for Wormhole network fees

## Upgrade Path

The contract is designed to be upgradeable using the UUPS pattern:
- 46 storage slots reserved for future additions
- Upgrade authorization controlled by contract owner
- Backward compatibility maintained through proper storage management

## Security Audits

This contract should undergo:
- Smart contract security audit
- Formal verification of critical functions
- Gas optimization analysis
- Cross-chain bridge security assessment

## License

MIT License - See SPDX-License-Identifier in contract source code.

---

**Note**: This contract is part of a larger cross-chain infrastructure and should be deployed as part of a comprehensive cross-chain solution. Always conduct thorough testing and security audits before mainnet deployment.

# Nuva EVM Contracts

This repository contains a set of smart contracts for the Nuva protocol, including token management, depositing, and withdrawal functionality with AML (Anti-Money Laundering) verification.

## Contracts Overview

### Core Contracts
- **CustomToken**: An ERC20 token with additional features like minting, burning, and permit functionality.
- **TokenFactory**: Factory contract for deploying new token instances.
- **Depositor**: Handles token deposits with AML verification.
- **Withdrawal**: Manages token withdrawals with AML verification.
- **DepositorFactory/WithdrawalFactory**: Factory contracts for deploying Depositor and Withdrawal instances.

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Hardhat

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd nuva-evm-contracts
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with gas reporting
REPORT_GAS=true npm test

# Run specific test file
npx hardhat test test/Depositor.js

# Run tests with detailed output
npx hardhat test --verbose
```

## Development

### Available Scripts

- `npm run lint`: Check code style
- `npm run lint:fix`: Automatically fix code style issues
- `npx hardhat compile`: Compile contracts
- `npx hardhat clean`: Clean cache and artifacts
- `npx hardhat node`: Start local Ethereum node
- `npx hardhat coverage`: Generate test coverage report

## Security

This project includes security features such as:
- Access control with OpenZeppelin's AccessControl
- Reentrancy protection
- Input validation
- AML signature verification

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request


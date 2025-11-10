// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Withdrawal} from "./Withdrawal.sol";

/*
 * @title WithdrawalFactory
 * @notice Deploys clones of the Withdrawal implementation.
 * @dev Stores clones by [paymentToken][withdrawalToken] pairs.
 */
// Errors
error ZeroAddress();
error WithdrawalAlreadyExists();
error NoExistingWithdrawalToMigrate();

/**
 * @title WithdrawalFactory
 * @notice Deploys clones of the Withdrawal implementation.
 * @dev Stores clones by [paymentToken][withdrawalToken] pairs.
 * @author NU Blockchain Technologies
 */
contract WithdrawalFactory is Ownable {
    // --- State Variables ---

    /**
     * @notice The address of the master logic contract (the implementation).
     */
    address public implementation;

    /**
     * @notice A nested mapping to find the withdrawal for a given pair.
     * @dev (Payment Token Address => (withdrawal Token Address => Cloned Withdrawal Address))
     */
    mapping(address => mapping(address => address)) public withdrawals;

    // --- Events ---

    /// @notice Emitted when the implementation address is updated
    /// @param newImplementation The address of the new implementation contract
    event ImplementationUpdated(address indexed newImplementation);

    /// @notice Emitted when a new withdrawal is created for a token pair
    /// @param paymentToken The address of the payment token
    /// @param withdrawalToken The address of the withdrawal token
    /// @param withdrawalAddress The address of the newly created withdrawal contract
    event WithdrawalCreated(
        address indexed paymentToken,
        address indexed withdrawalToken,
        address indexed withdrawalAddress
    );

    /// @notice Emitted when a withdrawal is migrated to a new implementation
    /// @param paymentToken The address of the payment token
    /// @param withdrawalToken The address of the withdrawal token
    /// @param oldWithdrawalAddress The address of the old withdrawal contract
    /// @param newWithdrawalAddress The address of the new withdrawal contract
    event WithdrawalMigrated(
        address indexed paymentToken,
        address indexed withdrawalToken,
        address indexed oldWithdrawalAddress,
        address newWithdrawalAddress
    );

    // --- Constructor ---

    /**
     * @notice Initializes the contract with the provided implementation address.
     * @dev Can only be called once during contract deployment.
     * @param _implementation The address of the *already deployed*
     * Withdrawal logic contract.
     */
    constructor(address _implementation) Ownable(msg.sender) {
        if (_implementation == address(0)) {
            revert ZeroAddress();
        }
        implementation = _implementation;
    }

    // --- Public Functions ---

    /**
     * @notice Creates and initializes a new withdrawal clone for a specific pair.
     * @param _paymentTokenAddress The (variable) payment token for this new withdrawal.
     * @param _withdrawalTokenAddress The (variable) input token (e.g., USDC) for this withdrawal.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @return withdrawalAddress The address of the newly created clone.
     */
    function createWithdrawal(
        address _paymentTokenAddress,
        address _withdrawalTokenAddress,
        address _amlSignerAddress
    ) external returns (address withdrawalAddress) {
        if (_paymentTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_withdrawalTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_amlSignerAddress == address(0)) {
            revert ZeroAddress();
        }

        // Check for existence using the nested mapping
        if (withdrawals[_paymentTokenAddress][_withdrawalTokenAddress] != address(0)) {
            revert WithdrawalAlreadyExists();
        }

        // 1. Create the cheap EIP-1167 clone
        withdrawalAddress = Clones.clone(implementation);

        // 2. Initialize the new clone with its unique state
        Withdrawal(withdrawalAddress).initialize(
            _withdrawalTokenAddress,
            _paymentTokenAddress,
            _amlSignerAddress
        );

        // 3. Save it to the nested mapping
        withdrawals[_paymentTokenAddress][_withdrawalTokenAddress] = withdrawalAddress;

        // 4. Emit the event
        emit WithdrawalCreated(
            _paymentTokenAddress,
            _withdrawalTokenAddress,
            withdrawalAddress
        );
    }

    /**
     * @notice Creates a new clone for an *existing* withdrawal.
     * @dev Overwrites the address in the 'withdrawals' map.
     * @param _paymentTokenAddress The (variable) payment token for this new withdrawal.
     * @param _withdrawalTokenAddress The (variable) withdrawal token (e.g., nuYLDS) for this withdrawal.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @return newWithdrawalAddress The address of the newly created clone.  
     */
    function migrateWithdrawal(
        address _paymentTokenAddress,
        address _withdrawalTokenAddress,
        address _amlSignerAddress
    ) external onlyOwner returns (address newWithdrawalAddress) {
        address oldWithdrawal = withdrawals[_paymentTokenAddress][
            _withdrawalTokenAddress
        ];

        // This check ensures we are only migrating pairs that exist
        if (oldWithdrawal == address(0)) {
            revert NoExistingWithdrawalToMigrate();
        }

        // Create a new clone pointing to the *current* implementation
        newWithdrawalAddress = Clones.clone(implementation);

        // Initialize the new clone
        Withdrawal(newWithdrawalAddress).initialize(
            _withdrawalTokenAddress,
            _paymentTokenAddress,
            _amlSignerAddress
        );

        // Overwrite the old address with the new one
        withdrawals[_paymentTokenAddress][
            _withdrawalTokenAddress
        ] = newWithdrawalAddress;

        emit WithdrawalMigrated(
            _paymentTokenAddress,
            _withdrawalTokenAddress,
            oldWithdrawal,
            newWithdrawalAddress
        );
    }

    /**
     * @notice Allows the owner to point the factory to a new
     * implementation contract.
     * @dev All *new* clones will use this new address.
     * @param _newImplementation The address of the new implementation contract.
     */
    function updateImplementation(
        address _newImplementation
    ) external onlyOwner {
        if (_newImplementation == address(0)) {
            revert ZeroAddress();
        }
        implementation = _newImplementation;
        emit ImplementationUpdated(_newImplementation);
    }
}

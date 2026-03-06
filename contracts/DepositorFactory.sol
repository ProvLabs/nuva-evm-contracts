// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {
    Ownable2Step,
    Ownable
} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Depositor} from "./Depositor.sol";

/*
 * @title DepositorFactory
 * @notice Deploys clones of the Depositor implementation.
 * @dev Stores clones by [shareToken][depositToken] pairs.
 */
// Errors
error ZeroAddress();
error DepositorAlreadyExists();
error NoExistingDepositorToMigrate();

/**
 * @title DepositorFactory
 * @notice Deploys clones of the Depositor implementation.
 * @dev Stores clones by [shareToken][depositToken] pairs.
 * @author NU Blockchain Technologies
 */
contract DepositorFactory is Ownable2Step {
    // --- State Variables ---

    /**
     * @notice The address of the master logic contract (the implementation).
     */
    address public implementation;

    /**
     * @notice A nested mapping to find the depositor for a given pair.
     * @dev (Share Token Address => (Deposit Token Address => Cloned Depositor Address))
     */
    mapping(address => mapping(address => address)) public depositors;

    // --- Events ---

    /// @notice Emitted when the implementation address is updated
    /// @param newImplementation The address of the new implementation contract
    event ImplementationUpdated(address indexed newImplementation);

    /// @notice Emitted when a new depositor is created for a token pair
    /// @param shareToken The address of the share token
    /// @param depositToken The address of the deposit token
    /// @param depositorAddress The address of the newly created depositor contract
    event DepositorCreated(
        address shareToken,
        address depositToken,
        address indexed depositorAddress
    );

    /// @notice Emitted when a depositor is migrated to a new implementation
    /// @param shareToken The address of the share token
    /// @param depositToken The address of the deposit token
    /// @param oldDepositorAddress The address of the old depositor contract
    /// @param newDepositorAddress The address of the new depositor contract
    event DepositorMigrated(
        address shareToken,
        address depositToken,
        address indexed oldDepositorAddress,
        address newDepositorAddress
    );

    // --- Constructor ---

    /**
     * @notice Initializes the contract with the provided implementation address.
     * @dev Can only be called once during contract deployment.
     * @param _implementation The address of the *already deployed*
     * Depositor logic contract.
     */
    constructor(address _implementation) Ownable(msg.sender) {
        if (_implementation == address(0)) {
            revert ZeroAddress();
        }
        implementation = _implementation;
    }

    // --- Public Functions ---

    /**
     * @notice Creates and initializes a new depositor clone for a specific pair.
     * @param _shareTokenAddress The (variable) share token for this new depositor.
     * @param _depositTokenAddress The (variable) input token (e.g., USDC) for this depositor.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @return depositorAddress The address of the newly created clone.
     */
    function createDepositor(
        address _shareTokenAddress,
        address _depositTokenAddress,
        address _amlSignerAddress
    ) external onlyOwner returns (address depositorAddress) {
        if (_shareTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_depositTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_amlSignerAddress == address(0)) {
            revert ZeroAddress();
        }

        // Check for existence using the nested mapping
        if (
            depositors[_shareTokenAddress][_depositTokenAddress] != address(0)
        ) {
            revert DepositorAlreadyExists();
        }

        // 1. Create the cheap EIP-1167 clone
        depositorAddress = Clones.clone(implementation);

        // 2. Initialize the new clone with its unique state
        Depositor(depositorAddress).initialize(
            _depositTokenAddress,
            _shareTokenAddress,
            _amlSignerAddress,
            msg.sender
        );

        // 3. Save it to the nested mapping
        depositors[_shareTokenAddress][_depositTokenAddress] = depositorAddress;

        // 4. Emit the event
        emit DepositorCreated(
            _shareTokenAddress,
            _depositTokenAddress,
            depositorAddress
        );
    }

    /**
     * @notice Creates a new clone for an *existing* pair.
     * @dev Overwrites the address in the 'depositors' map.
     * @param _shareTokenAddress The (variable) share token for this new depositor.
     * @param _depositTokenAddress The (variable) input token (e.g., USDC) for this depositor.
     * @param _amlSignerAddress The address of the trusted AML signer.
     * @return newDepositorAddress The address of the newly created clone.
     */
    function migrateDepositor(
        address _shareTokenAddress,
        address _depositTokenAddress,
        address _amlSignerAddress
    ) external onlyOwner returns (address newDepositorAddress) {
        if (_shareTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_depositTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        if (_amlSignerAddress == address(0)) {
            revert ZeroAddress();
        }

        address oldDepositor = depositors[_shareTokenAddress][
            _depositTokenAddress
        ];

        // This check ensures we are only migrating pairs that exist
        if (oldDepositor == address(0)) {
            revert NoExistingDepositorToMigrate();
        }

        // Create a new clone pointing to the *current* implementation
        newDepositorAddress = Clones.clone(implementation);

        // Initialize the new clone
        Depositor(newDepositorAddress).initialize(
            _depositTokenAddress,
            _shareTokenAddress,
            _amlSignerAddress,
            msg.sender
        );

        // Overwrite the old address with the new one
        depositors[_shareTokenAddress][
            _depositTokenAddress
        ] = newDepositorAddress;

        emit DepositorMigrated(
            _shareTokenAddress,
            _depositTokenAddress,
            oldDepositor,
            newDepositorAddress
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

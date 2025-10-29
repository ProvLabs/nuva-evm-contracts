// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Depositor.sol";

/**
 * @title DepositorFactory
 * @dev Deploys clones of the Depositor implementation.
 * Stores clones by [shareToken][depositToken] pairs.
 */
contract DepositorFactory is Ownable {
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

    event ImplementationUpdated(address indexed newImplementation);

    event DepositorCreated(
        address indexed shareToken,
        address indexed depositToken,
        address depositorAddress
    );

    event DepositorMigrated(
        address indexed shareToken,
        address indexed depositToken,
        address indexed oldDepositorAddress,
        address newDepositorAddress
    );

    // --- Constructor ---

    /**
     * @dev Sets the master logic contract address.
     * @param _implementation The address of the *already deployed*
     * Depositor logic contract.
     */
    constructor(address _implementation) Ownable(msg.sender) {
        require(_implementation != address(0), "Implementation cannot be zero");
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
    ) external returns (address depositorAddress) {
        require(
            _shareTokenAddress != address(0),
            "Share token address cannot be zero"
        );
        require(
            _depositTokenAddress != address(0),
            "Deposit address cannot be zero"
        );
        require(
            _amlSignerAddress != address(0),
            "Aml signer address cannot be zero"
        );

        // Check for existence using the nested mapping
        require(
            depositors[_shareTokenAddress][_depositTokenAddress] == address(0),
            "Depositor already exists for this pair"
        );

        // 1. Create the cheap EIP-1167 clone
        depositorAddress = Clones.clone(implementation);

        // 2. Initialize the new clone with its unique state
        Depositor(depositorAddress).initialize(
            _depositTokenAddress,
            _shareTokenAddress,
            _amlSignerAddress
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

    // --- Admin Functions ---

    /**
     * @notice Creates a new clone for an *existing* pair.
     * @dev Overwrites the address in the 'depositors' map.
     */
    function migrateDepositor(
        address _shareTokenAddress,
        address _depositTokenAddress,
        address _amlSignerAddress
    ) external onlyOwner returns (address newDepositorAddress) {
        address oldDepositor = depositors[_shareTokenAddress][
            _depositTokenAddress
        ];

        // This check ensures we are only migrating pairs that exist
        require(oldDepositor != address(0), "No existing depositor to migrate");

        // Create a new clone pointing to the *current* implementation
        newDepositorAddress = Clones.clone(implementation);

        // Initialize the new clone
        Depositor(newDepositorAddress).initialize(
            _depositTokenAddress,
            _shareTokenAddress,
            _amlSignerAddress
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
     */
    function updateImplementation(
        address _newImplementation
    ) external onlyOwner {
        require(_newImplementation != address(0), "Cannot be zero address");
        implementation = _newImplementation;
        emit ImplementationUpdated(_newImplementation);
    }
}

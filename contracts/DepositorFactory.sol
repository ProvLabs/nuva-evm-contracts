// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./Depositor.sol"; // Import the implementation

/**
 * @title DepositorFactory
 * @dev Deploys clones of the Depositor implementation.
 * Stores clones by [shareToken][depositToken] pairs.
 */
contract DepositorFactory {

    // --- State Variables ---

    /**
     * @notice The address of the master logic contract (the implementation).
     */
    address public immutable implementation;

    /**
     * @notice A nested mapping to find the depositor for a given pair.
     * @dev (Share Token Address => (Deposit Token Address => Cloned Depositor Address))
     */
    mapping(address => mapping(address => address)) public depositors; // <--- UPDATED

    // --- Events ---

    event DepositorCreated(
        address indexed shareToken,
        address indexed depositToken, // <--- RENAMED
        address depositorAddress
    );

    // --- Constructor ---

    /**
     * @dev Sets the master logic contract address.
     * @param _implementation The address of the *already deployed*
     * Depositor logic contract.
     */
    constructor(address _implementation) {
        require(_implementation != address(0), "Implementation cannot be zero");
        implementation = _implementation;
    }

    // --- Public Functions ---

    /**
     * @notice Creates and initializes a new depositor clone for a specific pair.
     * @param _shareTokenAddress The (variable) share token for this new depositor.
     * @param _depositTokenAddress The (variable) input token (e.g., USDC) for this depositor.
     * @return depositorAddress The address of the newly created clone.
     */
    function createDepositor( // <--- PARAMS RENAMED
        address _shareTokenAddress,
        address _depositTokenAddress
    ) external returns (address depositorAddress) {
        require(
            _shareTokenAddress != address(0),
            "Share token address cannot be zero"
        );
        require(
            _depositTokenAddress != address(0),
            "Deposit address cannot be zero"
        );

        // Check for existence using the nested mapping
        require(
            depositors[_shareTokenAddress][_depositTokenAddress] == address(0), // <--- UPDATED
            "Depositor already exists for this pair"
        );

        // 1. Create the cheap EIP-1167 clone
        depositorAddress = Clones.clone(implementation);

        // 2. Initialize the new clone with its unique state
        Depositor(depositorAddress).initialize(
            _depositTokenAddress,
            _shareTokenAddress
        );

        // 3. Save it to the nested mapping
        depositors[_shareTokenAddress][_depositTokenAddress] = depositorAddress; // <--- UPDATED

        // 4. Emit the event
        emit DepositorCreated(
            _shareTokenAddress,
            _depositTokenAddress,
            depositorAddress
        );
    }
}

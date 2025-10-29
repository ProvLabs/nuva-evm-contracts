// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// TODO
// safeerc20 instead?
// access control list for multi admin functionality? read open zeppelin docs

/**
 * @title Depositor
 * @dev This is the LOGIC contract. It will be "cloned" by the factory.
 * It accepts a specified token (depositToken) and sends it to a
 * user-provided destination address.
 */
contract Depositor is Initializable {
    // --- State Variables ---

    IERC20 public depositToken;
    address public shareToken;
    address public amlSigner;
    mapping(bytes32 => bool) public usedSignatures;

    // --- Events ---

    event Deposit(
        address indexed user,
        uint256 amount,
        address indexed shareToken,
        address indexed destinationAddress
    );

    // --- Initializer ---

    /**
     * @dev Initializer. Replaces the constructor.
     * @param _depositTokenAddress The token contract this depositor will accept.
     * @param _shareTokenAddress The token address to emit in the log.
     * @param _amlSignerAddress The address of the trusted AML signer.
     */
    function initialize(
        address _depositTokenAddress,
        address _shareTokenAddress,
        address _amlSignerAddress
    ) external initializer {
        require(
            _depositTokenAddress != address(0),
            "Deposit token address cannot be zero"
        );
        require(
            _shareTokenAddress != address(0),
            "Share token address cannot be zero"
        );
        require(
            _amlSignerAddress != address(0),
            "Aml signer address cannot be zero"
        );

        depositToken = IERC20(_depositTokenAddress);
        shareToken = _shareTokenAddress;
        amlSigner = _amlSignerAddress;
    }

    // --- Public Functions ---

    /**
     * @notice Deposits tokens after user provides a separate `approve`.
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     */
    function deposit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline
    ) external {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        _doDeposit(_amount, _destinationAddress);
    }

    /**
     * @notice Deposits tokens using an off-chain 'permit' signature.
     * @dev This allows for a single-transaction approve+deposit.
     * @dev Requires AML signature.
     * @param _amount The amount of tokens to deposit.
     * @param _destinationAddress The address to send the tokens to.
     * @param _amlSignature The address to send the tokens to.
     * @param _amlDeadline The time at which the AML signature expires.
     * @param _permitDeadline The time at which the permit signature expires.
     * @param _v, _r, _s The components of the EIP-712 permit signature from the user.
     */
    function depositWithPermit(
        uint256 _amount,
        address _destinationAddress,
        bytes calldata _amlSignature,
        uint256 _amlDeadline,
        uint256 _permitDeadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        bytes32 messageHash = _getMessageHash(
            _amount,
            _destinationAddress,
            _amlDeadline
        );
        _verifyAML(messageHash, _amlSignature, _amlDeadline);

        // This call will fail if the signature is invalid or deadline passed.
        IERC20Permit(address(depositToken)).permit(
            msg.sender, // The user (owner)
            address(this), // The spender (this contract)
            _amount, // The amount
            _permitDeadline, // Expiration
            _v,
            _r,
            _s // The user's signature
        );

        _doDeposit(_amount, _destinationAddress);
    }

    // --- Private Helper Functions ---

    /**
     * @dev Internal function to perform the token transfer.
     */
    function _doDeposit(uint256 _amount, address _destinationAddress) private {
        require(_amount > 0, "Amount must be greater than zero");
        require(
            _destinationAddress != address(0),
            "Destination cannot be zero"
        );

        bool success = depositToken.transferFrom(
            msg.sender,
            _destinationAddress,
            _amount
        );
        require(success, "Token transfer failed. Check allowance/permit.");

        emit Deposit(msg.sender, _amount, shareToken, _destinationAddress);
    }

    /**
     * @dev Internal function to verify the AML signature.
     */
    function _verifyAML(
        bytes32 messageHash,
        bytes calldata _signature,
        uint256 _deadline
    ) private {
        // Check if the signature has expired
        require(block.timestamp <= _deadline, "AML signature expired");

        // Replay Prevention
        require(!usedSignatures[messageHash], "AML signature already used");

        // Recover the Signer
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(
            messageHash
        );
        address recoveredSigner = ECDSA.recover(ethSignedHash, _signature);

        // Validate the Signer
        require(recoveredSigner != address(0), "Invalid AML signature");
        require(recoveredSigner == amlSigner, "Invalid AML signer");

        // Mark Signature as Used
        usedSignatures[messageHash] = true;
    }

    /**
     * @dev Internal function to build the AML message hash.
     */
    function _getMessageHash(
        uint256 _amount,
        address _destinationAddress,
        uint256 _deadline
    ) private view returns (bytes32) {
        // This hash MUST match what the frontend AML signer signs
        return
            keccak256(
                abi.encodePacked(
                    msg.sender,
                    address(depositToken),
                    shareToken,
                    _amount,
                    _destinationAddress,
                    _deadline
                )
            );
    }
}

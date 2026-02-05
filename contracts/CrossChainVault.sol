// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IWormhole} from "./modules/wormhole/IWormhole.sol";
import {BytesLib} from "./modules/utils/BytesLib.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICircleIntegration} from "./modules/wormhole/ICircleIntegration.sol";
import {CrossChainVaultGovernance} from "./CrossChainVaultGovernance.sol";
import {CrossChainVaultMessages} from "./CrossChainVaultMessages.sol";

error InvalidWormholeAddress(); // dev: invalid Wormhole address
error InvalidTokenBridgeAddress(); // dev: invalid TokenBridge address
error InvalidChainId(); // dev: invalid chainId
error InvalidWormholeFinality(); // dev: invalid wormholeFinality
error InvalidFeePrecision(); // dev: invalid fee precision
error InvalidTokenAddress(); // dev: invalid token address
error AmountMustBeGreaterThanZero(); // dev: amount must be greater than zero
error TargetRecipientCannotBeBytes32Zero(); // dev: target recipient cannot be bytes32(0)
error NormalizedAmountMustBeGreaterThanZero(); // dev: normalized amount must be greater than zero
error EmitterNotRegistered(); // dev: emitter not registered
error InsufficientValue(); // dev: insufficient value
error EmitterNotRegisteredForChain(); // dev: emitter not registered for chain
error TokenNotAttested(); // dev: token not attested
error InvalidEvmAddress(); // dev: invalid EVM address

/**
 * @title A Cross-Chain Token Application
 * @notice This contract uses Wormhole's token bridge contract to send tokens
 * cross chain with an aribtrary message payload.
 * @author NU Blockchain Technologies
 */
contract CrossChainVault is CrossChainVaultGovernance, CrossChainVaultMessages, ReentrancyGuard {
    using BytesLib for bytes;

    /**
     * @notice Deploys the smart contract and sanity checks initial deployment values
     * @dev Sets the owner, wormhole, tokenBridge, chainId, wormholeFinality,
     * feePrecision and relayerFeePercentage state variables. See TokenState.sol
     * for descriptions of each state variable.
     * @param wormhole_ The address of the Wormhole contract
     * @param tokenBridge_ The address of the TokenBridge contract
     * @param chainId_ The chain ID of the network
     * @param wormholeFinality_ The finality of the Wormhole network
     * @param feePrecision The precision of the fee
     * @param relayerFeePercentage The percentage of the fee that is paid to the relayer
     */
    constructor(
        address wormhole_,
        address tokenBridge_,
        uint16 chainId_,
        uint8 wormholeFinality_,
        uint32 feePrecision,
        uint32 relayerFeePercentage
    ) {
        // sanity check input values
        require(wormhole_ != address(0), InvalidWormholeAddress());
        require(tokenBridge_ != address(0), InvalidTokenBridgeAddress());
        require(chainId_ > 0, InvalidChainId());
        require(wormholeFinality_ > 0, InvalidWormholeFinality());
        require(feePrecision > 0, InvalidFeePrecision());

        // set constructor state variables
        setOwner(msg.sender);
        setWormhole(wormhole_);
        setTokenBridge(tokenBridge_);
        setChainId(chainId_);
        setWormholeFinality(wormholeFinality_);
        setFeePrecision(feePrecision);
        setRelayerFeePercentage(relayerFeePercentage);
    }

    /**
     * @notice Transfers specified tokens to any registered Token contract
     * by invoking the `transferTokensWithPayload` method on the Wormhole token
     * bridge contract. `transferTokensWithPayload` allows the caller to send
     * an arbitrary message payload along with a token transfer. In this case,
     * the arbitrary message includes the transfer recipient's target-chain
     * wallet address.
     * @dev reverts if:
     * - `token` is address(0)
     * - `amount` is zero
     * - `targetRecipient` is bytes32(0)
     * - a registered Token contract does not exist for the `targetChain`
     * - caller doesn't pass enough value to pay the Wormhole network fee
     * - normalized `amount` is zero
     * @param token Address of `token` to be transferred
     * @param amount Amount of `token` to be transferred
     * @param targetChain Wormhole chain ID of the target blockchain
     * @param batchId Wormhole message ID
     * @param targetRecipient Address in bytes32 format (zero-left-padded if
     * less than 20 bytes) of the recipient's wallet on the target blockchain.
     * @return messageSequence Wormhole message sequence for the Wormhole token
     * bridge contract. This sequence is incremented (per message) for each
     * message emitter.
     */
    function sendTokensWithPayload(
        address token,
        uint256 amount,
        uint16 targetChain,
        uint32 batchId,
        bytes32 targetRecipient
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // sanity check function arguments
        require(token != address(0), InvalidTokenAddress());
        require(amount > 0, AmountMustBeGreaterThanZero());
        require(
            targetRecipient != bytes32(0),
            TargetRecipientCannotBeBytes32Zero()
        );

        /**
         * Compute the normalized amount to verify that it's nonzero.
         * The token bridge peforms the same operation before encoding
         * the amount in the `TransferWithPayload` message.
         */
        require(
            normalizeAmount(amount, getDecimals(token)) > 0,
            NormalizedAmountMustBeGreaterThanZero()
        );

        // Cache the target contract address and verify that there
        // is a registered emitter for the specified targetChain.
        bytes32 targetContract = getRegisteredEmitter(targetChain);
        require(targetContract != bytes32(0), EmitterNotRegistered());

        // Cache Wormhole fee value, and confirm that the caller has sent
        // enough value to pay for the Wormhole message fee.
        uint256 wormholeFee = wormhole().messageFee();
        require(msg.value == wormholeFee, InsufficientValue());

        // transfer tokens from user to the this contract
        uint256 amountReceived = custodyTokens(token, amount);

        /**
         * Encode instructions (CrossChainVaultMessage) to send with the token transfer.
         * The `targetRecipient` address is in bytes32 format (zero-left-padded) to
         * support non-evm smart contracts that have addresses that are longer
         * than 20 bytes.
         */
        bytes memory messagePayload = encodePayload(
            CrossChainVaultMessage({
                payloadID: 1,
                targetRecipient: targetRecipient
            })
        );

        // cache TokenBridge instance
        ICircleIntegration integration = circleIntegration();

        // approve the token bridge to spend the specified tokens
        SafeERC20.forceApprove(
            IERC20(token),
            address(integration),
            amountReceived
        );

         ICircleIntegration.TransferParameters memory transferParams = ICircleIntegration.TransferParameters( {
            token: token,
            amount: amountReceived,
            targetChain: targetChain,
            mintRecipient: targetContract
         });

        /**
         * Call `transferTokensWithPayload`method on the token bridge and pay
         * the Wormhole network fee. The token bridge will emit a Wormhole
         * message with an encoded `TransferWithPayload` struct (see the
         * ITokenBridge.sol interface file in this repo).
         */
        messageSequence = integration.transferTokensWithPayload{value: wormholeFee}(
            transferParams,
            batchId,
            messagePayload
        );
    }

    /**
     * @notice Consumes `TransferWithPayload` message which includes the additional
     * `CrossChainVaultMessage` payload with additional transfer instructions.
     * @dev The token bridge contract calls the Wormhole core endpoint to verify
     * the `TransferWithPayload` message. The token bridge contract saves the message
     * hash in storage to prevent `TransferWithPayload` messages from being replayed.
     * @dev reverts if:
     * - The token being transferred has not been attested yet. This means that a
     * wrapped contract for the token does not exist.
     * - The caller of the token bridge on the source chain is not a registered
     * Token contract.
     * @param encodedTransferMessage Encoded `TransferWithPayload` message
     */
    function redeemTransferWithPayload(
        bytes memory encodedTransferMessage,
        bytes memory circleBridgeMessage,
        bytes memory circleAttestation
    ) public {
        /**
         * parse the encoded Wormhole message
         *
         * SECURITY: This message not been verified by the Wormhole core layer yet.
         * The encoded payload can only be trusted once the message has been verified
         * by the Wormhole core contract. In this case, the message will be verified
         * by a call to the token bridge contract in subsequent actions.
         */
        IWormhole.VM memory parsedMessage = wormhole().parseVM(
            encodedTransferMessage
        );

        // cache the token bridge instance
        ICircleIntegration integration = circleIntegration();
    
        ICircleIntegration.RedeemParameters memory redeemParams = ICircleIntegration.RedeemParameters({
            encodedWormholeMessage: encodedTransferMessage,
            circleBridgeMessage: circleBridgeMessage,
            circleAttestation: circleAttestation
        });

        ICircleIntegration.DepositWithPayload memory deposit = integration.redeemTokensWithPayload(
            redeemParams
        );

        address localTokenAddress = bytes32ToAddress(deposit.token);

        // confirm that the message sender is a registered Token contract
        require(
            deposit.fromAddress == getRegisteredEmitter(parsedMessage.emitterChainId),
            EmitterNotRegisteredForChain()
        );

        // parse the Token payload from the `TransferWithPayload` struct
        CrossChainVaultMessage memory tokenPayload = decodePayload(
            deposit.payload
        );

        // compute the relayer fee in terms of the transferred token
        uint256 relayerFee = calculateRelayerFee(deposit.amount);

        // cache the recipient address
        address recipient = bytes32ToAddress(tokenPayload.targetRecipient);

        /**
         * If the caller is the `transferRecipient` (self redeem) or the relayer fee
         * is set to zero, send the full token amount to the recipient. Otherwise,
         * send the relayer the calculated fee and the recipient the remainder.
         */
        if (relayerFee == 0 || msg.sender == recipient) {
            // send the full amount to the recipient
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                recipient,
                deposit.amount
            );
        } else {
            // pay the relayer
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                msg.sender,
                relayerFee
            );

            // send the tokens (less relayer fees) to the recipient
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                recipient,
                deposit.amount - relayerFee
            );
        }
    }

    /**
     * @notice Calculates the amount of tokens to send the redeemer (relayer)
     * in terms of the transferred token based on the set `relayerFeePercentage`
     * on this chain.
     * @param amount The number of tokens being transferred
     * @return Fee Uint256 amount of tokens to send the relayer
     */
    function calculateRelayerFee(uint256 amount) public view returns (uint256) {
        return amount * relayerFeePercentage() / feePrecision();
    }
    
    /**
     * @notice Custodies tokens by transferring them from the caller to this contract.
     * @param token Address of the token to custody.
     * @param amount Amount of tokens to custody.
     * @return balanceDifference The difference in token balance after the transfer.
     */
    function custodyTokens(
        address token,
        uint256 amount
    ) internal returns (uint256) {
        // query own token balance before transfer
        uint256 balanceBefore = getBalance(token);

        // deposit tokens
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );

        // return the balance difference
        return getBalance(token) - balanceBefore;
    }

    /**
     * @notice Gets the balance of the specified token for this contract.
     * @param token Address of the token to check.
     * @return balance The balance of the specified token for this contract.
     */
    function getBalance(address token) internal view returns (uint256 balance) {
        // fetch the specified token balance for this contract
        (, bytes memory queriedBalance) =
            token.staticcall(
                abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
            );
        balance = abi.decode(queriedBalance, (uint256));
    }

    /**
     * @notice Converts an address to a bytes32 value.
     * @param address_ The address to convert.
     * @return bytes32 The converted address.
     */
    function addressToBytes32(address address_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }

    /**
     * @notice Converts a bytes32 value to an address.
     * @param address_ The bytes32 value to convert.
     * @return address The converted address.
     */
    function bytes32ToAddress(bytes32 address_) internal pure returns (address) {
        require(bytes12(address_) == 0, InvalidEvmAddress());
        return address(uint160(uint256(address_)));
    }

    /**
     * @notice Gets the decimals of the specified token.
     * @param token Address of the token to check.
     * @return decimals The decimals of the specified token.
     */
    function getDecimals(
        address token
    ) internal view returns (uint8) {
        (,bytes memory queriedDecimals) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        return abi.decode(queriedDecimals, (uint8));
    }

    /**
     * @notice Normalizes the amount of tokens to a standard unit.
     * @param amount The amount of tokens to normalize.
     * @param decimals The decimals of the token.
     * @return normalizedAmount The normalized amount of tokens.
     */
    function normalizeAmount(
        uint256 amount,
        uint8 decimals
    ) internal pure returns(uint256) {
        if (decimals > 8) {
            amount /= 10 ** (decimals - 8);
        }
        return amount;
    }
}

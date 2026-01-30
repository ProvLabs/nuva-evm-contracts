// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainVaultGetters} from "./CrossChainVaultGetters.sol";

error EmitterChainIdCannotBeZeroOrThisChain(); // dev: Emitter chain ID cannot be zero or this chain
error EmitterAddressCannotBeZero(); // dev: Emitter address cannot be zero
error EmitterAlreadyRegistered(); // dev: Emitter already registered
error PrecisionMustBeGreaterThanZero(); // dev: Precision must be greater than zero
error RelayerFeePercentageMustBeLessThanPrecision(); // dev: Relayer fee percentage must be less than precision
error CallerNotTheOwner(); // dev: Caller is not the owner

/**
 * @title CrossChainVaultGovernance
 * @notice Governance contract for managing emitter registrations and relayer fees
 * @author Nuva
 */
contract CrossChainVaultGovernance is CrossChainVaultGetters {
    /**
     * @notice Registers foreign emitters (CrossChainVault contracts) with this contract
     * @dev Only the deployer (owner) can invoke this method
     * @param emitterChainId Wormhole chainId of the contract being registered.
     * See https://book.wormhole.com/reference/contracts.html for more information.
     * @param emitterAddress 32-byte address of the contract being registered. For EVM
     * contracts the first 12 bytes should be zeros.
     */
    function registerEmitter(
        uint16 emitterChainId,
        bytes32 emitterAddress
    ) public onlyOwner {
        // sanity check the emitterChainId and emitterAddress input values
        require(
            emitterChainId != 0 && emitterChainId != chainId(),
            EmitterChainIdCannotBeZeroOrThisChain()
        );
        require(
            emitterAddress != bytes32(0),
            EmitterAddressCannotBeZero()
        );

        // update the registeredEmitters state variable
        setEmitter(emitterChainId, emitterAddress);
    }

    /**
     * @notice Updates the relayer fee percentage and precision
     * @dev Only the deployer (owner) can invoke this method
     * @param relayerFeePercentage The percentage of each transfer that is
     * rewarded to the relayer.
     * @param relayerFeePrecision The precision of the relayer fee
     */
    function updateRelayerFee(
        uint32 relayerFeePercentage,
        uint32 relayerFeePrecision
    ) public onlyOwner {
        require(relayerFeePrecision > 0, PrecisionMustBeGreaterThanZero());
        require(
            relayerFeePercentage < relayerFeePrecision,
            RelayerFeePercentageMustBeLessThanPrecision()
        );

        setRelayerFeePercentage(relayerFeePercentage);
        setFeePrecision(relayerFeePrecision);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, CallerNotTheOwner());
        _;
    }
}

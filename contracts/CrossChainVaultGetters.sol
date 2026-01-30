// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IWormhole} from "./modules/wormhole/IWormhole.sol";
import {ITokenBridge} from "./modules/wormhole/ITokenBridge.sol";

import {CrossChainVaultSetters} from "./CrossChainVaultSetters.sol";

/**
 * @title CrossChainVaultGetters
 * @notice Getter functions for token contract state
 * @author NU Blockchain Technologies
 */
contract CrossChainVaultGetters is CrossChainVaultSetters {
    /**
     * @notice Returns the owner of the contract
     * @return The address of the owner
     */
    function owner() public view returns (address) {
        return _state.owner;
    }

    /**
     * @notice Returns the Wormhole contract
     * @return The IWormhole contract instance
     */
    function wormhole() public view returns (IWormhole) {
        return IWormhole(_state.wormhole);
    }

    /**
     * @notice Returns the TokenBridge contract
     * @return The ITokenBridge contract instance
     */
    function tokenBridge() public view returns (ITokenBridge) {
        return ITokenBridge(payable(_state.tokenBridge));
    }

    /**
     * @notice Returns the chain ID
     * @return The chain ID
     */
    function chainId() public view returns (uint16) {
        return _state.chainId;
    }

    /**
     * @notice Returns the Wormhole finality
     * @return The Wormhole finality
     */
    function wormholeFinality() public view returns (uint8) {
        return _state.wormholeFinality;
    }

    /**
     * @notice Returns the registered emitter for a given chain ID
     * @param emitterChainId The chain ID of the emitter
     * @return The registered emitter address
     */
    function getRegisteredEmitter(uint16 emitterChainId) public view returns (bytes32) {
        return _state.registeredEmitters[emitterChainId];
    }

    /**
     * @notice Returns the fee precision
     * @return The fee precision
     */
    function feePrecision() public view returns (uint32) {
        return _state.feePrecision;
    }

    /**
     * @notice Returns the relayer fee percentage
     * @return The relayer fee percentage
     */
    function relayerFeePercentage() public view returns (uint32) {
        return _state.relayerFeePercentage;
    }
}

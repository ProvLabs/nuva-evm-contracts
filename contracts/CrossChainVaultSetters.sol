// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CrossChainVaultState} from "./CrossChainVaultState.sol";

/**
 * @title CrossChainVaultSetters
 * @dev This contract manages the setters for cross chain vault operations.
 * @author NU Blockchain Technologies
 * @notice This contract is used to manage the setters for cross chain vault operations.
 */
contract CrossChainVaultSetters is CrossChainVaultState {
    /**
     * @notice Sets the owner of the contract
     * @param owner_ The address of the owner
     */
    function setOwner(address owner_) internal {
        _state.owner = owner_;
    }

    /**
     * @notice Sets the wormhole address
     * @param wormhole_ The address of the wormhole
     */
    function setWormhole(address wormhole_) internal {
        _state.wormhole = payable(wormhole_);
    }

    /**
     * @notice Sets the token bridge address
     * @param tokenBridge_ The address of the token bridge
     */
    function setTokenBridge(address tokenBridge_) internal {
        _state.tokenBridge = payable(tokenBridge_);
    }

    /**
     * @notice Sets the chain ID
     * @param chainId_ The chain ID
     */
    function setChainId(uint16 chainId_) internal {
        _state.chainId = chainId_;
    }

    /**
     * @notice Sets the wormhole finality
     * @param finality The wormhole finality
     */
    function setWormholeFinality(uint8 finality) internal {
        _state.wormholeFinality = finality;
    }

    /**
     * @notice Sets the emitter address
     * @param chainId The chain ID
     * @param emitter The emitter address
     */
    function setEmitter(uint16 chainId, bytes32 emitter) internal {
        _state.registeredEmitters[chainId] = emitter;
    }

    /**
     * @notice Sets the fee precision
     * @param feePrecision_ The fee precision
     */
    function setFeePrecision(uint32 feePrecision_) internal {
        _state.feePrecision = feePrecision_;
    }

    /**
     * @notice Sets the relayer fee percentage
     * @param relayerFeePercentage_ The relayer fee percentage
     */
    function setRelayerFeePercentage(uint32 relayerFeePercentage_) internal {
        _state.relayerFeePercentage = relayerFeePercentage_;
    }
}

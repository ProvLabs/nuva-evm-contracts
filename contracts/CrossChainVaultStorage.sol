// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CrossChainVaultStorage
 * @dev This contract defines the storage state for cross chain vault operations.
 * @author NU Blockchain Technologies
 * @notice This contract is used to define the storage state for cross chain vault operations.
 */
contract CrossChainVaultStorage {
    struct State {
        // owner of this contract
        address owner;

        // address of the Wormhole contract on this chain
        address wormhole;

        // address of the Wormhole TokenBridge contract on this chain
        address tokenBridge;

        // Wormhole chain ID of this contract
        uint16 chainId;

        // The number of block confirmations needed before the wormhole network
        // will attest a message.
        uint8 wormholeFinality;

        // precision of relayer fee percentage
        uint32 feePrecision;

        // relayer fee in percentage terms
        uint32 relayerFeePercentage;

        /**
         * Wormhole chain ID to known emitter address mapping. xDapps using
         * Wormhole should register all deployed contracts on each chain to
         * verify that messages being consumed are from trusted contracts.
         */
        mapping(uint16 => bytes32) registeredEmitters;
    }
}

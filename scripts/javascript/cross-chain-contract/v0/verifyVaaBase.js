const hre = require("hardhat");

async function main() {
    const contractAddress = "0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35";
    const encodedVM =
        "0x0100000000010087ea9b545a1dc3a03994774816427422699bfdf54b615f271b4f21baaa69a4b37199569aaa292a538f12fac412a6aa2fcc107a756f1f84783b80609f6ebc0077006984e46c0000000100020000000000000000000000002703483b1a5a7c577e8680de9df8be03c6f30e3c000000000000018bc8010000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c723800000000000000000000000000000000000000000000000000000000000f424000000000000000060000000000096ce6000000000000000000000000e49425ed1b967618ddf9cbc936ceb8868dbc97b30000000000000000000000008d5752fd983731db0329ac818ae0676baa7339cc002101000000000000000000000000dd3199e196bbf9a463500d5fb442fb7f78131f7a";

    // Using hre.ethers for the Hardhat environment
    const coreBridge = await hre.ethers.getContractAt(
        [
            "function parseAndVerifyVM(bytes encodedVM) external view returns (tuple(uint8 version, uint32 timestamp, uint32 nonce, uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, uint8 consistencyLevel, bytes payload, uint32 guardianSetIndex, tuple(uint8 r, bytes32 s, uint8 v)[] signatures, bytes32 hash) vm, bool valid, string reason)",
        ],
        contractAddress,
    );

    console.log("Calling parseAndVerifyVM...");

    try {
        const [vm, valid, reason] = await coreBridge.parseAndVerifyVM(encodedVM);

        console.log("----------------------------");
        // console.log("Verification Success:", valid);
        // if (valid) {
        //   console.log("Emitter Chain ID:", vm.emitterChainId);
        //   console.log("Sequence:", vm.sequence.toString());
        //   console.log("Payload:", vm.payload);
        // } else {
        //   console.log("Reason for Failure:", reason);
        // }
        console.log(vm);
        console.log("----------------------------");
    } catch (error) {
        console.error("RPC Error:", error.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

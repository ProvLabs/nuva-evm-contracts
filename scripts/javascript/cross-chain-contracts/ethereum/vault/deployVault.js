const { ethers } = require("hardhat");

async function main() {
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

    const executor = "0x2fcc7b2332d924764f17f1cf5eda1cd4b36751a2";

    console.log("Deploying Vault...");
    const proxy = await upgrades.deployProxy(CrossChainVault, [executor], {
        initializer: "initialize",
        kind: "uups",
    });

    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("----------------------------------------------");
    console.log(`Proxy deployed to: ${proxyAddress}`);
    console.log(`Implementation deployed to: ${implementationAddress}`);
    console.log("----------------------------------------------");
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken ERC20Permit", function () {
    async function deploy() {
        const [deployer, owner, spender] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("TokenFactory");
        const factory = await Factory.deploy();
        await factory.waitForDeployment();

        const name = "PermitToken";
        const symbol = "PRMT";
        const decimals = 6;

        const tx = await factory.createToken(name, symbol, decimals);
        await tx.wait();

        const addresses = await factory.getAllTokens();
        const tokenAddr = addresses[addresses.length - 1];
        const token = await ethers.getContractAt("CustomToken", tokenAddr);

        // fund owner with some tokens
        const scale = 10n ** BigInt(decimals);
        await token.connect(deployer).mint(await owner.getAddress(), 1_000_000n * scale);

        return { deployer, owner, spender, token, name, symbol, decimals };
    }

    async function buildPermit(owner, token, spender, value, deadline) {
        const ownerAddr = await owner.getAddress();
        const chainId = (await ethers.provider.getNetwork()).chainId;
        const nonce = await token.nonces(ownerAddr);
        const domain = {
            name: await token.name(),
            version: "1",
            chainId,
            verifyingContract: await token.getAddress(),
        };
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const values = {
            owner: ownerAddr,
            spender: await spender.getAddress(),
            value,
            nonce,
            deadline,
        };

        const signature = await owner.signTypedData(domain, types, values);
        const sig = ethers.Signature.from(signature);
        return { v: sig.v, r: sig.r, s: sig.s };
    }

    it("nonces start at 0 and increment after permit", async function () {
        const { owner, spender, token, decimals } = await deploy();

        const ownerAddr = await owner.getAddress();
        const spenderAddr = await spender.getAddress();

        expect(await token.nonces(ownerAddr)).to.equal(0n);

        const value = 1234n * 10n ** BigInt(decimals);
        const latestBlock = await ethers.provider.getBlock("latest");
        const deadline = BigInt(latestBlock.timestamp) + 3600n;
        const { v, r, s } = await buildPermit(owner, token, spender, value, deadline);

        await expect(token.permit(ownerAddr, spenderAddr, value, deadline, v, r, s)).to.emit(token, "Approval");

        expect(await token.allowance(ownerAddr, spenderAddr)).to.equal(value);
        expect(await token.nonces(ownerAddr)).to.equal(1n);
    });

    it("reverts when deadline has passed", async function () {
        const { owner, spender, token, decimals } = await deploy();

        const ownerAddr = await owner.getAddress();
        const spenderAddr = await spender.getAddress();

        const value = 1n * 10n ** BigInt(decimals);
        const latestBlock = await ethers.provider.getBlock("latest");
        const pastDeadline = BigInt(latestBlock.timestamp) - 1n;
        const { v, r, s } = await buildPermit(owner, token, spender, value, pastDeadline);

        await expect(token.permit(ownerAddr, spenderAddr, value, pastDeadline, v, r, s)).to.be.reverted;
    });

    it("reverts with invalid signer (signature not from owner)", async function () {
        const { owner, spender, token, decimals } = await deploy();

        const ownerAddr = await owner.getAddress();
        const spenderAddr = await spender.getAddress();

        const value = 5n * 10n ** BigInt(decimals);
        const latestBlock = await ethers.provider.getBlock("latest");
        const deadline = BigInt(latestBlock.timestamp) + 3600n;

        // Build signature with wrong signer (spender) but set owner field to owner
        const chainId = (await ethers.provider.getNetwork()).chainId;
        const nonce = await token.nonces(ownerAddr);
        const domain = {
            name: await token.name(),
            version: "1",
            chainId,
            verifyingContract: await token.getAddress(),
        };
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const values = { owner: ownerAddr, spender: spenderAddr, value, nonce, deadline };
        const signature = await spender.signTypedData(domain, types, values);
        const sig = ethers.Signature.from(signature);

        await expect(token.permit(ownerAddr, spenderAddr, value, deadline, sig.v, sig.r, sig.s)).to.be.reverted;
    });
});

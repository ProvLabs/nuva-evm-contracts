const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helpers
async function latestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp);
}

// Helper function to get AML signature for Withdrawal contract
async function getAMLSignature({ contract, amlSigner, user, amount, deadline, destinationAddress }) {
    const chainId = (await user.provider.getNetwork()).chainId;
    const domain = {
        name: "Depositor",
        version: "1",
        chainId,
        verifyingContract: await contract.getAddress(),
    };

    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const message = {
        sender: user.address,
        amount,
        destinationAddress,
        deadline,
    };

    const sig = await amlSigner.signTypedData(domain, types, message);
    return sig;
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
    const values = { owner: ownerAddr, spender, value, nonce, deadline };
    const signature = await owner.signTypedData(domain, types, values);
    const sig = ethers.Signature.from(signature);
    return { v: sig.v, r: sig.r, s: sig.s };
}

describe("Depositor", function () {
    async function deployFixture() {
        const [deployer, user, amlSigner, destinationManager, destination] = await ethers.getSigners();

        // Deploy CustomToken via factory or directly via TokenFactory
        const TokenFactory = await ethers.getContractFactory("TokenFactory");
        const tokenFactory = await TokenFactory.deploy();
        await tokenFactory.waitForDeployment();

        const name = "USD Coin";
        const symbol = "USDC";
        const decimals = 6;
        await (await tokenFactory.createToken(name, symbol, decimals)).wait();
        const tokens = await tokenFactory.getAllTokens();
        const tokenAddress = tokens[tokens.length - 1];
        const token = await ethers.getContractAt("CustomToken", tokenAddress);

        // Mint tokens to user for deposits
        const scale = 10n ** BigInt(decimals);
        const MINTER_ROLE = await token.MINTER_ROLE();
        await expect(token.connect(deployer).grantRole(MINTER_ROLE, await deployer.getAddress())).to.emit(
            token,
            "RoleGranted",
        );
        await token.connect(deployer).mint(await user.getAddress(), 1_000_000n * scale);

        // Deploy Depositor implementation with linked library
        const DepositorImpl = await ethers.getContractFactory("Depositor");
        const depositorImpl = await DepositorImpl.deploy();
        await depositorImpl.waitForDeployment();

        const DepositorFactory = await ethers.getContractFactory("DepositorFactory");
        const depositorFactory = await DepositorFactory.deploy(await depositorImpl.getAddress());
        await depositorFactory.waitForDeployment();

        // Create a depositor via factory
        const shareToken = ethers.Wallet.createRandom().address; // arbitrary address placeholder
        await (
            await depositorFactory.createDepositor(shareToken, await token.getAddress(), await amlSigner.getAddress())
        ).wait();
        const depositorAddr = await depositorFactory.depositors(shareToken, await token.getAddress());
        const depositor = await ethers.getContractAt("Depositor", depositorAddr);
        const DESTINATION_MANAGER_ROLE = await depositor.DESTINATION_MANAGER_ROLE();
        await expect(
            depositor.connect(deployer).grantRole(DESTINATION_MANAGER_ROLE, await destinationManager.getAddress()),
        ).to.emit(depositor, "RoleGranted");
        await expect(
            depositor.connect(destinationManager).addDestinationAddress(await destination.getAddress()),
        ).to.emit(depositor, "DestinationAddressAdded");

        return { deployer, user, amlSigner, destination, token, decimals, depositor, shareToken, destinationManager };
    }

    it("initializes correctly via factory", async function () {
        const { depositor, token, shareToken, amlSigner } = await deployFixture();
        expect(await depositor.shareToken()).to.equal(shareToken);
        expect(await depositor.amlSigner()).to.equal(await amlSigner.getAddress());
        expect(await depositor.depositToken()).to.equal(await token.getAddress());
    });

    it("deposit with prior approve transfers tokens and emits event", async function () {
        const { user, destination, token, decimals, depositor, amlSigner, shareToken } = await deployFixture();

        const amt = 1234n * 10n ** BigInt(decimals);
        await token.connect(user).approve(await depositor.getAddress(), amt);

        const deadline = (await latestTimestamp()) + 3600n;
        const signature = await getAMLSignature({
            contract: depositor,
            amlSigner,
            user,
            amount: amt,
            destinationAddress: await destination.getAddress(),
            deadline,
        });

        const balBefore = await token.balanceOf(await destination.getAddress());
        await expect(depositor.connect(user).deposit(amt, await destination.getAddress(), signature, deadline))
            .to.emit(depositor, "Deposit")
            .withArgs(
                await user.getAddress(),
                amt,
                await depositor.depositToken(),
                shareToken,
                await destination.getAddress(),
            );

        const balAfter = await token.balanceOf(await destination.getAddress());
        expect(balAfter - balBefore).to.equal(amt);
    });

    it("reverts deposit on AML expired, wrong signer, and replay", async function () {
        const { user, destination, token, decimals, depositor, amlSigner, shareToken } = await deployFixture();
        const amt = 5n * 10n ** BigInt(decimals);
        await token.connect(user).approve(await depositor.getAddress(), amt);

        const nowTs = await latestTimestamp();

        // expired
        const sigExpired = await getAMLSignature({
            contract: depositor,
            amlSigner,
            user,
            amount: amt,
            destinationAddress: await destination.getAddress(),
            deadline: nowTs - 1n,
        });

        // Test expired signature - should revert with AmlSignatureExpired
        await expect(
            depositor.connect(user).deposit(amt, await destination.getAddress(), sigExpired, nowTs - 1n),
        ).to.be.revertedWithCustomError(depositor, "AmlSignatureExpired");

        // Test wrong signer
        const imposter = (await ethers.getSigners())[3];
        const deadline = nowTs + 3600n;
        const sigWrong = await getAMLSignature({
            contract: depositor,
            amlSigner: imposter,
            user,
            amount: amt,
            destinationAddress: await destination.getAddress(),
            deadline,
        });
        await expect(
            depositor.connect(user).deposit(amt, await destination.getAddress(), sigWrong, deadline),
        ).to.be.revertedWithCustomError(depositor, "InvalidAmlSigner");

        // Test replay protection
        const signature = await getAMLSignature({
            contract: depositor,
            amlSigner,
            user,
            amount: amt,
            destinationAddress: await destination.getAddress(),
            deadline,
        });

        // First deposit should succeed
        await expect(depositor.connect(user).deposit(amt, await destination.getAddress(), signature, deadline)).to.emit(
            depositor,
            "Deposit",
        );

        // Second deposit with same signature should fail
        await expect(
            depositor.connect(user).deposit(amt, await destination.getAddress(), signature, deadline),
        ).to.be.revertedWithCustomError(depositor, "AmlSignatureAlreadyUsed");
    });

    it("validates destination manager can manage destination addresses", async function () {
        const { deployer, user, destination, depositor, destinationManager } = await deployFixture();

        await expect(
            depositor.connect(destinationManager).removeDestinationAddress(await destination.getAddress()),
        ).to.emit(depositor, "DestinationAddressRemoved");
        await expect(
            depositor.connect(destinationManager).addDestinationAddress(await destination.getAddress()),
        ).to.emit(depositor, "DestinationAddressAdded");
        await expect(
            depositor.connect(destinationManager).addDestinationAddress(await destination.getAddress()),
        ).to.emit(depositor, "DestinationAddressSkipped");

        // user cannot manage
        await expect(
            depositor.connect(user).removeDestinationAddress(await destination.getAddress()),
        ).to.be.revertedWithCustomError(depositor, "AccessControlUnauthorizedAccount");
        await expect(
            depositor.connect(user).addDestinationAddress(await destination.getAddress()),
        ).to.be.revertedWithCustomError(depositor, "AccessControlUnauthorizedAccount");

        // user can manage after role addition
        const DESTINATION_MANAGER_ROLE = await depositor.DESTINATION_MANAGER_ROLE();
        await expect(depositor.connect(deployer).grantRole(DESTINATION_MANAGER_ROLE, await user.getAddress())).to.emit(
            depositor,
            "RoleGranted",
        );
        await expect(
            depositor.connect(deployer).revokeRole(DESTINATION_MANAGER_ROLE, await destinationManager.getAddress()),
        ).to.emit(depositor, "RoleRevoked");
        await expect(depositor.connect(user).removeDestinationAddress(await destination.getAddress())).to.emit(
            depositor,
            "DestinationAddressRemoved",
        );
        await expect(depositor.connect(user).addDestinationAddress(await destination.getAddress())).to.emit(
            depositor,
            "DestinationAddressAdded",
        );
        await expect(depositor.connect(user).addDestinationAddress(await destination.getAddress())).to.emit(
            depositor,
            "DestinationAddressSkipped",
        );
    });

    it("validates amount and destination", async function () {
        const { user, destination, token, depositor, amlSigner, destinationManager } = await deployFixture();

        // approve some so we hit internal checks
        await token.connect(user).approve(await depositor.getAddress(), 100n);
        const deadline = (await latestTimestamp()) + 3600n;

        const build = async (amount, dest) =>
            getAMLSignature({
                contract: depositor,
                amlSigner,
                user,
                amount,
                destinationAddress: dest,
                deadline,
            });

        // Test zero amount
        {
            const signature = await build(0n, await destination.getAddress());
            // This is a contract-level error, not from AMLUtils
            await expect(
                depositor.connect(user).deposit(0n, await destination.getAddress(), signature, deadline),
            ).to.be.revertedWithCustomError(depositor, "InvalidAmount");
        }

        // Test zero destination
        {
            const signature = await build(1n, ethers.ZeroAddress);
            // This is a contract-level error, not from AMLUtils
            await expect(depositor.connect(user).deposit(1n, ethers.ZeroAddress, signature, deadline))
                .to.be.revertedWithCustomError(depositor, "InvalidAddress")
                .withArgs("destination");
        }

        // Test destination not in allow list
        {
            const signature = await build(1n, await user.getAddress());
            // This is a contract-level error, not from AMLUtils
            await expect(depositor.connect(user).deposit(1n, await user.getAddress(), signature, deadline))
                .to.be.revertedWithCustomError(depositor, "InvalidAddress")
                .withArgs("destination");
        }

        // Test destination removed from allow list
        {
            await expect(
                depositor.connect(destinationManager).removeDestinationAddress(await destination.getAddress()),
            ).to.emit(depositor, "DestinationAddressRemoved");
            const signature = await build(1n, await destination.getAddress());
            // This is a contract-level error, not from AMLUtils
            await expect(depositor.connect(user).deposit(1n, await destination.getAddress(), signature, deadline))
                .to.be.revertedWithCustomError(depositor, "InvalidAddress")
                .withArgs("destination");
        }
    });

    it("depositWithPermit performs permit then transfers in one tx", async function () {
        const { user, destination, token, decimals, depositor, amlSigner } = await deployFixture();

        const amt = 777n * 10n ** BigInt(decimals);
        const nowTs = await latestTimestamp();
        const permitDeadline = nowTs + 3600n;

        // Build AML signature
        const signature = await getAMLSignature({
            contract: depositor,
            amlSigner,
            user,
            amount: amt,
            destinationAddress: await destination.getAddress(),
            deadline: nowTs + 3600n,
        });

        // Build permit signature (spender is depositor)
        const { v, r, s } = await buildPermit(user, token, await depositor.getAddress(), amt, permitDeadline);

        const destBefore = await token.balanceOf(await destination.getAddress());

        await expect(
            depositor
                .connect(user)
                .depositWithPermit(
                    amt,
                    await destination.getAddress(),
                    signature,
                    nowTs + 3600n,
                    permitDeadline,
                    v,
                    r,
                    s,
                ),
        ).to.emit(token, "Approval"); // Approval from permit

        const destAfter = await token.balanceOf(await destination.getAddress());
        expect(destAfter - destBefore).to.equal(amt);

        // Allowance should be consumed down to 0 after transferFrom
        expect(await token.allowance(await user.getAddress(), await depositor.getAddress())).to.equal(0n);
    });
});
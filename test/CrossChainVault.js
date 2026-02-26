const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("CrossChainVault", function () {
    let crossChainVault;
    let owner, user1, user2, user3;
    let mockExecutor;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock executor
        const MockExecutor = await ethers.getContractFactory("MockExecutor");
        mockExecutor = await MockExecutor.deploy();
        await mockExecutor.waitForDeployment();

        // Deploy CrossChainVault
        const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

        // Deploy proxy and initialize
        const proxy = await upgrades.deployProxy(CrossChainVault, [await mockExecutor.getAddress()], {
            initializer: "initialize",
            kind: "uups",
        });
        await proxy.waitForDeployment();

        const proxyAddress = await proxy.getAddress();
        crossChainVault = await ethers.getContractAt("CrossChainVault", proxyAddress);
    });

    describe("Whitelist Management", function () {
        it("Should add address to whitelist", async function () {
            await expect(crossChainVault.connect(owner).addToWhitelist(user1.address))
                .to.emit(crossChainVault, "Whitelisted")
                .withArgs(user1.address);

            expect(await crossChainVault.isWhitelisted(user1.address)).to.be.true;
            const whitelist = await crossChainVault.getWhitelist();
            expect(whitelist).to.include(user1.address);
        });

        it("Should skip adding duplicate address", async function () {
            await crossChainVault.connect(owner).addToWhitelist(user1.address);

            await expect(crossChainVault.connect(owner).addToWhitelist(user1.address))
                .to.emit(crossChainVault, "WhitelistingSkipped")
                .withArgs(user1.address);
        });

        it("Should reject adding zero address", async function () {
            await expect(
                crossChainVault.connect(owner).addToWhitelist(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(crossChainVault, "InvalidAddress");
        });

        it("Should remove address from whitelist", async function () {
            // Add multiple addresses first
            await crossChainVault.connect(owner).addToWhitelist(user1.address);
            await crossChainVault.connect(owner).addToWhitelist(user2.address);
            await crossChainVault.connect(owner).addToWhitelist(user3.address);

            // Remove middle address
            await expect(crossChainVault.connect(owner).removeFromWhitelist(user2.address))
                .to.emit(crossChainVault, "WhitelistRevoked")
                .withArgs(user2.address);

            expect(await crossChainVault.isWhitelisted(user2.address)).to.be.false;

            const whitelist = await crossChainVault.getWhitelist();
            expect(whitelist).to.include(user1.address);
            expect(whitelist).to.include(user3.address);
            expect(whitelist).to.not.include(user2.address);
        });

        it("Should skip removing non-existent address", async function () {
            await expect(crossChainVault.connect(owner).removeFromWhitelist(user1.address))
                .to.emit(crossChainVault, "WhitelistingSkipped")
                .withArgs(user1.address);
        });

        it("Should handle multiple add/remove operations efficiently", async function () {
            const addresses = [user1.address, user2.address, user3.address];

            // Add all addresses
            for (const addr of addresses) {
                await crossChainVault.connect(owner).addToWhitelist(addr);
            }

            // Remove all addresses
            for (const addr of addresses) {
                await crossChainVault.connect(owner).removeFromWhitelist(addr);
            }

            // Verify all are removed
            for (const addr of addresses) {
                expect(await crossChainVault.isWhitelisted(addr)).to.be.false;
            }

            const whitelist = await crossChainVault.getWhitelist();
            expect(whitelist.length).to.equal(0);
        });

        it("Should maintain correct order after removals", async function () {
            // Add addresses in order
            await crossChainVault.connect(owner).addToWhitelist(user1.address);
            await crossChainVault.connect(owner).addToWhitelist(user2.address);
            await crossChainVault.connect(owner).addToWhitelist(user3.address);

            let whitelist = await crossChainVault.getWhitelist();
            expect(whitelist).to.deep.equal([user1.address, user2.address, user3.address]);

            // Remove middle address
            await crossChainVault.connect(owner).removeFromWhitelist(user2.address);

            whitelist = await crossChainVault.getWhitelist();
            // Should be [user1, user3] after removal
            expect(whitelist).to.deep.equal([user1.address, user3.address]);

            // Remove first address
            await crossChainVault.connect(owner).removeFromWhitelist(user1.address);

            whitelist = await crossChainVault.getWhitelist();
            // Should be [user3] after removal
            expect(whitelist).to.deep.equal([user3.address]);
        });

        it("Should reject unauthorized access", async function () {
            await expect(crossChainVault.connect(user1).addToWhitelist(user1.address)).to.be.revertedWithCustomError(
                crossChainVault,
                "OwnableUnauthorizedAccount",
            );

            await expect(
                crossChainVault.connect(user1).removeFromWhitelist(user1.address),
            ).to.be.revertedWithCustomError(crossChainVault, "OwnableUnauthorizedAccount");
        });
    });

    describe("Token Operations", function () {
        it("Should get correct balance", async function () {
            const [owner] = await ethers.getSigners();

            // Deploy a Mock Token (assuming you have a simple ERC20 mock)
            const Token = await ethers.getContractFactory("MockERC20");
            const token = await Token.deploy("Test", "TST");
            await token.waitForDeployment();

            // Deploy Harness
            const HarnessFactory = await ethers.getContractFactory("CrossChainVaultHarness");
            const harness = await HarnessFactory.deploy();

            // Test with real token address
            // Should be 0 initially
            expect(await harness.exposeGetBalance(await token.getAddress())).to.equal(0);

            // Send some tokens to the harness and check again
            await token.mint(await harness.getAddress(), ethers.parseEther("100"));
            expect(await harness.exposeGetBalance(await token.getAddress())).to.equal(ethers.parseEther("100"));
        });

        it("Should normalize amounts correctly", async function () {
            const HarnessFactory = await ethers.getContractFactory("CrossChainVaultHarness");
            const harness = await HarnessFactory.deploy();

            const amount18 = ethers.parseEther("1");
            const amount8 = ethers.parseUnits("1", 8);
            const amount6 = ethers.parseUnits("1", 6);

            // Test with 18 decimals
            expect(await harness.exposeNormalizeAmount(amount18, 18)).to.equal(amount8);

            // Test with 8 decimals
            expect(await harness.exposeNormalizeAmount(amount8, 8)).to.equal(amount8);

            // Test with 6 decimals
            expect(await harness.exposeNormalizeAmount(amount6, 6)).to.equal(amount6);
        });
    });

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
            const executor = await mockExecutor.getAddress();

            await expect(
                upgrades.deployProxy(CrossChainVault, [executor], {
                    initializer: "initialize",
                    kind: "uups",
                }),
            ).to.not.be.reverted;
        });

        it("Should initialize state correctly", async function () {
            const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
            const executor = await mockExecutor.getAddress();

            const deployedVault = await upgrades.deployProxy(CrossChainVault, [executor], {
                initializer: "initialize",
                kind: "uups",
            });

            expect(await deployedVault.executor()).to.equal(executor);
        });

        it("Should reject zero executor address", async function () {
            const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

            await expect(
                upgrades.deployProxy(CrossChainVault, [ethers.ZeroAddress], {
                    initializer: "initialize",
                    kind: "uups",
                }),
            ).to.be.revertedWithCustomError(CrossChainVault, "InvalidExecutorAddress");
        });

        it("Should reject re-initialization", async function () {
            await expect(crossChainVault.initialize(await mockExecutor.getAddress())).to.be.reverted;
        });
    });
});

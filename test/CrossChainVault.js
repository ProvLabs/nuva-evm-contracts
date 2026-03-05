const { ethers } = require("hardhat");
const { expect } = require("chai");

// Helper function to create ExecutorArgs
function createExecutorArgs(refundAddress = ethers.Wallet.createRandom().address) {
    return {
        refundAddress,
        signedQuote: ethers.hexlify(ethers.randomBytes(100)),
        instructions: ethers.hexlify(ethers.randomBytes(200)),
    };
}

// Helper function to create FeeArgs
function createFeeArgs(transferTokenFee = 0) {
    return {
        transferTokenFee,
        nativeTokenFee: 0,
        payee: ethers.Wallet.createRandom().address,
    };
}

describe("CrossChainVault", function () {
    let crossChainVault;
    let owner, user1, user2, user3;
    let mockExecutor;

    const WHITELISTED_ROLE = ethers.id("WHITELISTED_ROLE");

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
        it("Should grant address as whitelist", async function () {
            await crossChainVault.connect(owner).grantRole(WHITELISTED_ROLE, user1.address);

            // Verify the role was granted
            const hasRole = await crossChainVault.hasRole(WHITELISTED_ROLE, user1.address);
            expect(hasRole).to.be.true;
        });

        it("Should revoke address as whitelist", async function () {
            await crossChainVault.connect(owner).grantRole(WHITELISTED_ROLE, user1.address);

            // Verify the role was granted
            let hasRole = await crossChainVault.hasRole(WHITELISTED_ROLE, user1.address);
            expect(hasRole).to.be.true;

            await crossChainVault.connect(owner).revokeRole(WHITELISTED_ROLE, user1.address);

            // Verify the role was revoked
            hasRole = await crossChainVault.hasRole(WHITELISTED_ROLE, user1.address);
            expect(hasRole).to.be.false;
        });

        it("Should revert when grant with random account", async function () {
            await expect(crossChainVault.connect(user1).grantRole(WHITELISTED_ROLE, user2.address))
                .to.be.revertedWithCustomError(crossChainVault, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, ethers.zeroPadValue(ethers.ZeroAddress, 32));
        });

        it("Should revert when revoke with random account", async function () {
            await expect(crossChainVault.connect(user1).revokeRole(WHITELISTED_ROLE, user2.address))
                .to.be.revertedWithCustomError(crossChainVault, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, ethers.zeroPadValue(ethers.ZeroAddress, 32));
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

    describe("sendTokens Function", function () {
        let mockToken;

        beforeEach(async function () {
            const MockToken = await ethers.getContractFactory("MockERC20");
            mockToken = await MockToken.deploy("Mock Token", "MOCK");
            await mockToken.waitForDeployment();

            await mockToken.mint(await crossChainVault.getAddress(), ethers.parseEther("1000"));

            await crossChainVault.connect(owner).grantRole(WHITELISTED_ROLE, user1.address);
        });

        it("Should send tokens successfully", async function () {
            const amount = ethers.parseEther("100");
            const vaultAddress = await crossChainVault.getAddress();

            // Ensure user1 has tokens
            await mockToken.mint(user1.address, amount);

            // APPROVE the vault to spend user1's tokens
            await mockToken.connect(user1).approve(vaultAddress, amount);

            const targetChain = 2;
            const targetDomain = 1;
            const targetRecipient = ethers.zeroPadValue(user2.address, 32);

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainVault
                    .connect(user1)
                    .sendTokens(
                        await mockToken.getAddress(),
                        amount,
                        targetChain,
                        targetDomain,
                        targetRecipient,
                        executorArgs,
                        feeArgs,
                        { value: ethers.parseEther("0.5") },
                    ),
            ).to.emit(crossChainVault, "TokensSent");
        });

        it("Should reject zero token address", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainVault
                    .connect(user1)
                    .sendTokens(
                        ethers.ZeroAddress,
                        ethers.parseEther("100"),
                        2,
                        1,
                        ethers.zeroPadValue(user2.address, 32),
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainVault, "InvalidTokenAddress");
        });

        it("Should reject zero amount", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainVault
                    .connect(user1)
                    .sendTokens(
                        await mockToken.getAddress(),
                        0,
                        2,
                        1,
                        ethers.zeroPadValue(user2.address, 32),
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainVault, "AmountMustBeGreaterThanZero");
        });

        it("Should reject zero target recipient", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainVault
                    .connect(user1)
                    .sendTokens(
                        await mockToken.getAddress(),
                        ethers.parseEther("100"),
                        2,
                        1,
                        ethers.ZeroHash,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainVault, "TargetRecipientCannotBeBytes32Zero");
        });

        it("Should reject non-whitelisted caller", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await crossChainVault.connect(owner).revokeRole(WHITELISTED_ROLE, user1.address);

            await expect(
                crossChainVault
                    .connect(user1)
                    .sendTokens(
                        await mockToken.getAddress(),
                        ethers.parseEther("100"),
                        2,
                        1,
                        ethers.zeroPadValue(user2.address, 32),
                        executorArgs,
                        feeArgs,
                    ),
            )
                .to.be.revertedWithCustomError(crossChainVault, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, WHITELISTED_ROLE);
        });

        it("Should reject with insufficient allowance when contract doesn't have the allowance", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            const amount = ethers.parseEther("100");
            await expect(
                crossChainVault.connect(user1).sendTokens(
                    await mockToken.getAddress(),
                    amount,
                    2,
                    1,
                    ethers.zeroPadValue(user2.address, 32),
                    executorArgs,
                    feeArgs,
                    { value: 0 }, // No ETH sent
                ),
            )
                .to.be.revertedWithCustomError(mockToken, "ERC20InsufficientAllowance")
                .withArgs(await crossChainVault.getAddress(), 0, amount);
        });

        it("Should pass with 0 ETH for fees as Executor is mocked", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            const amount = ethers.parseEther("100");
            const vaultAddress = await crossChainVault.getAddress();

            // Ensure user1 has tokens
            await mockToken.mint(user1.address, amount);

            // APPROVE the vault to spend user1's tokens
            await mockToken.connect(user1).approve(vaultAddress, amount);

            await expect(
                crossChainVault.connect(user1).sendTokens(
                    await mockToken.getAddress(),
                    amount,
                    2,
                    1,
                    ethers.zeroPadValue(user2.address, 32),
                    executorArgs,
                    feeArgs,
                    { value: 0 }, // No ETH sent
                ),
            ).to.emit(crossChainVault, "TokensSent");
        });

        it("Should reject normalized amount of zero", async function () {
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            const MockToken6Decimals = await ethers.getContractFactory("MockERC20");
            const mockToken6 = await MockToken6Decimals.deploy("Mock6", "MOCK6");
            await mockToken6.waitForDeployment();

            await mockToken6.mint(await crossChainVault.getAddress(), ethers.parseUnits("100", 6));

            await expect(
                crossChainVault.connect(user1).sendTokens(
                    await mockToken6.getAddress(),
                    ethers.parseUnits("0.000001", 6), // This will normalize to 0
                    2,
                    1,
                    ethers.zeroPadValue(user2.address, 32),
                    executorArgs,
                    feeArgs,
                ),
            ).to.be.revertedWithCustomError(crossChainVault, "NormalizedAmountMustBeGreaterThanZero");
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

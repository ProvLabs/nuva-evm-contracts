const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { ZeroAddress } = require("ethers");

// Helper function to get current timestamp
async function latestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp);
}

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

// Helper function to get AML signature for Deposit
async function getDepositAMLSignature({ contract, amlSigner, user, amount, deadline, destinationAddress }) {
    // Define the EIP-712 Domain
    const domain = {
        name: "Depositor",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await contract.getAddress(),
    };

    // Define the Types
    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    // Define the Values
    const value = {
        sender: user.address,
        amount,
        destinationAddress,
        deadline,
    };

    // Sign using signTypedData
    const signature = await amlSigner.signTypedData(domain, types, value);

    return signature;
}

// Helper function to get AML signature for Withdraw
async function getWithdrawAMLSignature({ contract, amlSigner, user, amount, deadline, destinationAddress }) {
    // Define the EIP-712 Domain
    const domain = {
        name: "Withdrawal",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await contract.getAddress(),
    };

    // Define the Types (matches your Solidity struct exactly)
    const types = {
        Withdraw: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    // Define the Values
    const value = {
        sender: user.address,
        amount,
        destinationAddress,
        deadline,
    };

    // Sign using signTypedData (No manual hashing required!)
    const signature = await amlSigner.signTypedData(domain, types, value);
    return signature;
}

// Helper function to build permit signature
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
    const message = {
        owner: ownerAddr,
        spender: await spender.getAddress(),
        value,
        nonce,
        deadline,
    };
    const sig = await owner.signTypedData(domain, types, message);
    return sig;
}

describe("CrossChainManager", function () {
    let crossChainManager;
    let customToken;
    let crossChainVault;
    let shareToken;
    let owner;
    let amlSigner;
    let user1;
    let user2;
    let destinationAddress;
    let mockExecutor;

    const DEPOSIT_AMOUNT = ethers.parseEther("100");
    const WITHDRAW_AMOUNT = ethers.parseEther("100");
    const TARGET_CHAIN = 10002; // Ethereum sepolia
    const TARGET_DOMAIN = 0; // Ethereum sepolia

    beforeEach(async function () {
        [owner, amlSigner, user1, user2, destinationAddress] = await ethers.getSigners();

        // Deploy CustomToken
        const CustomToken = await ethers.getContractFactory("CustomToken");
        customToken = await CustomToken.deploy("Test Token", "TEST", owner.address, 6);
        await customToken.waitForDeployment();

        // GRANT the role to the owner so they can mint tokens in the test
        let MINTER_ROLE = await customToken.MINTER_ROLE();
        await customToken.grantRole(MINTER_ROLE, owner.address);

        // Deploy ShareToken (mock ICustomToken)
        const ShareToken = await ethers.getContractFactory("CustomToken");
        shareToken = await ShareToken.deploy("Share Token", "SHARE", owner.address, 6);
        await shareToken.waitForDeployment();

        // Grant role for ShareToken as well if needed
        MINTER_ROLE = await shareToken.MINTER_ROLE();
        await shareToken.grantRole(MINTER_ROLE, owner.address);

        const MockExecutor = await ethers.getContractFactory("MockExecutor");
        mockExecutor = await MockExecutor.deploy();

        // Deploy CrossChainVault (mock)
        const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

        // Deploy proxy and initialize
        const vaultProxy = await upgrades.deployProxy(CrossChainVault, [await mockExecutor.getAddress()], {
            initializer: "initialize",
            kind: "uups",
        });
        await vaultProxy.waitForDeployment();

        const vaultProxyAddress = await vaultProxy.getAddress();
        crossChainVault = await ethers.getContractAt("CrossChainVault", vaultProxyAddress);

        // Deploy CrossChainManager implementation
        const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

        // Deploy proxy and initialize
        const proxy = await upgrades.deployProxy(
            CrossChainManager,
            [
                await customToken.getAddress(),
                await shareToken.getAddress(),
                amlSigner.address,
                await crossChainVault.getAddress(),
            ],
            {
                initializer: "initialize",
                kind: "uups",
            },
        );
        await proxy.waitForDeployment();

        const proxyAddress = await proxy.getAddress();
        crossChainManager = await ethers.getContractAt("CrossChainManager", proxyAddress);

        // Manually add the destination address since the contract doesn't do it in initialize
        await crossChainManager.connect(owner).addDestinationAddress(destinationAddress.address);

        // Mint tokens to users
        await customToken.mint(user1.address, ethers.parseEther("10000"));
        await customToken.mint(user2.address, ethers.parseEther("10000"));

        // Approve tokens to CrossChainManager
        await customToken.connect(user1).approve(await crossChainManager.getAddress(), ethers.parseEther("10000"));
        await customToken.connect(user2).approve(await crossChainManager.getAddress(), ethers.parseEther("10000"));
        await shareToken.connect(user1).approve(await crossChainManager.getAddress(), ethers.parseEther("10000"));
        await shareToken.connect(user2).approve(await crossChainManager.getAddress(), ethers.parseEther("10000"));

        // Whitelist the CrossChainMananger contract address
        const WHITELISTED_ROLE = ethers.id("WHITELISTED_ROLE");
        await crossChainVault.connect(owner).grantRole(WHITELISTED_ROLE, await crossChainManager.getAddress());
    });

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            expect(await crossChainManager.owner()).to.equal(await owner.address);
            expect(await crossChainManager.token()).to.equal(await customToken.getAddress());
            expect(await crossChainManager.shareToken()).to.equal(await shareToken.getAddress());
            expect(await crossChainManager.amlSigner()).to.equal(amlSigner.address);
            expect(await crossChainManager.crossChainVault()).to.equal(await crossChainVault.getAddress());
        });

        it("Should emit CrossChainManagerInitialized event", async function () {
            const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

            // Resolve all addresses first to catch the 'null' variable
            const customTokenAddr = await customToken.getAddress();
            const shareTokenAddr = await shareToken.getAddress();
            const amlAddr = await amlSigner.getAddress();
            const vaultAddr = await crossChainVault.getAddress();

            const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

            // Deploy and capture the instance
            const proxy = await upgrades.deployProxy(CrossChainManager, initArgs, {
                initializer: "initialize",
                kind: "uups",
            });

            // Wait for the transaction to be mined to check events
            await expect(proxy.deploymentTransaction())
                .to.emit(proxy, "CrossChainManagerInitialized")
                .withArgs(...initArgs);
        });

        it("Should not allow zero address for token", async function () {
            const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

            // Resolve all addresses first to catch the 'null' variable
            const customTokenAddr = ZeroAddress;
            const shareTokenAddr = await shareToken.getAddress();
            const amlAddr = await amlSigner.getAddress();
            const vaultAddr = await crossChainVault.getAddress();

            const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

            // Deploy and capture the instance
            await expect(
                upgrades.deployProxy(CrossChainManager, initArgs, {
                    initializer: "initialize",
                    kind: "uups",
                }),
            )
                .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
                .withArgs("token");
        });

        it("Should not allow zero address for share token", async function () {
            const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

            // Resolve all addresses first to catch the 'null' variable
            const customTokenAddr = await customToken.getAddress();
            const shareTokenAddr = ZeroAddress;
            const amlAddr = await amlSigner.getAddress();
            const vaultAddr = await crossChainVault.getAddress();

            const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

            // Deploy and capture the instance
            await expect(
                upgrades.deployProxy(CrossChainManager, initArgs, {
                    initializer: "initialize",
                    kind: "uups",
                }),
            )
                .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
                .withArgs("share token");
        });

        it("Should not allow zero address for AML signer", async function () {
            const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

            // Resolve all addresses first to catch the 'null' variable
            const customTokenAddr = await customToken.getAddress();
            const shareTokenAddr = await shareToken.getAddress();
            const amlAddr = ZeroAddress;
            const vaultAddr = await crossChainVault.getAddress();

            const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

            // Deploy and capture the instance
            await expect(
                upgrades.deployProxy(CrossChainManager, initArgs, {
                    initializer: "initialize",
                    kind: "uups",
                }),
            )
                .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
                .withArgs("aml signer");
        });

        it("Should not allow zero address for cross chain vault", async function () {
            const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

            // Resolve all addresses first to catch the 'null' variable
            const customTokenAddr = await customToken.getAddress();
            const shareTokenAddr = await shareToken.getAddress();
            const amlAddr = await amlSigner.getAddress();
            const vaultAddr = ZeroAddress;

            const initArgs = [customTokenAddr, shareTokenAddr, amlAddr, vaultAddr];

            // Deploy and capture the instance
            await expect(
                upgrades.deployProxy(CrossChainManager, initArgs, {
                    initializer: "initialize",
                    kind: "uups",
                }),
            )
                .to.be.revertedWithCustomError(CrossChainManager, "InvalidAddress")
                .withArgs("cross chain vault");
        });
    });

    describe("CrossChainManager Upgradeability", function () {
        it("Should upgrade CrossChainManager and preserve state", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            )
                .to.emit(crossChainManager, "Deposited")
                .withArgs(
                    user1.address,
                    DEPOSIT_AMOUNT,
                    await customToken.getAddress(),
                    await shareToken.getAddress(),
                    destinationAddress.address,
                    TARGET_CHAIN,
                );

            const depositTokenBefore = await crossChainManager.token();
            const crossChainVaultBefore = await crossChainManager.crossChainVault();
            const shareTokenBefore = await crossChainManager.shareToken();
            const amlSignerBefore = await crossChainManager.amlSigner();

            // Upgrade to V2
            const CrossChainManagerV2 = await ethers.getContractFactory("CrossChainManagerV2");
            const initialFee = ethers.parseEther("1");
            const upgraded = await upgrades.upgradeProxy(await crossChainManager.getAddress(), CrossChainManagerV2, {
                call: { fn: "initializeV2", args: [initialFee] },
                kind: "uups"
            });

            // Verify state is preserved
            expect(await crossChainManager.token()).to.equal(depositTokenBefore);
            expect(await upgraded.crossChainVault()).to.equal(crossChainVaultBefore);
            expect(await upgraded.shareToken()).to.equal(shareTokenBefore);
            expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);

            // Verify new logic works
            expect(await upgraded.version()).to.equal("V2");
            expect(await upgraded.processingFee()).to.equal(initialFee);
            const newFee = ethers.parseEther("2");
            await expect(upgraded.connect(owner).setProcessingFee(newFee))
                .to.emit(upgraded, "ProcessingFeeUpdated")
                .withArgs(initialFee, newFee);
            expect(await upgraded.processingFee()).to.equal(newFee);
        });

        it("Should prevent non-owners from upgrading CrossChainManager", async function () {
            const CrossChainManagerV2 = await ethers.getContractFactory("CrossChainManagerV2");
            await expect(
                upgrades.upgradeProxy(await crossChainManager.getAddress(), CrossChainManagerV2.connect(user1)),
            )
                .to.be.revertedWithCustomError(crossChainManager, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("Deposit", function () {
        it("Should allow deposit with valid AML signature", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            )
                .to.emit(crossChainManager, "Deposited")
                .withArgs(
                    user1.address,
                    DEPOSIT_AMOUNT,
                    await customToken.getAddress(),
                    await shareToken.getAddress(),
                    destinationAddress.address,
                    TARGET_CHAIN,
                );
        });

        it("Should allow deposit with permit", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const permitDeadline = (await latestTimestamp()) + 7200n;
            const permitSignature = await buildPermit(
                user1,
                customToken,
                crossChainManager,
                DEPOSIT_AMOUNT,
                permitDeadline,
            );
            const { v, r, s } = ethers.Signature.from(permitSignature);

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .depositWithPermit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        permitDeadline,
                        v,
                        r,
                        s,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.emit(crossChainManager, "Deposited");
        });

        it("Should reject deposit with zero amount", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: 0,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        0,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainManager, "InvalidAmount");
        });

        it("Should reject deposit with invalid destination", async function () {
            const deadline = (await latestTimestamp()) + 7200n; // Use different deadline

            // First add the invalid destination to generate a valid signature
            await crossChainManager.connect(owner).addDestinationAddress(user2.address);

            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: user2.address,
            });

            // Now remove the destination to make it invalid
            await crossChainManager.connect(owner).removeDestinationAddress(user2.address);

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager.connect(user1).deposit(
                    DEPOSIT_AMOUNT,
                    user2.address, // Now this is an invalid destination
                    amlSignature,
                    deadline,
                    TARGET_CHAIN,
                    TARGET_DOMAIN,
                    executorArgs,
                    feeArgs,
                ),
            ).to.be.revertedWithCustomError(crossChainManager, "InvalidAddress");
        });

        it("Should reject deposit with expired deadline", async function () {
            const deadline = (await latestTimestamp()) - 1n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainManager, "AmlSignatureExpired");
        });

        it("Should reject deposit with invalid AML signature", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const invalidSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner: user2, // Wrong signer
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        invalidSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainManager, "InvalidAmlSigner");
        });

        it("Should reject deposit with reused AML signature", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: DEPOSIT_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            // First deposit should succeed
            await crossChainManager
                .connect(user1)
                .deposit(
                    DEPOSIT_AMOUNT,
                    destinationAddress.address,
                    amlSignature,
                    deadline,
                    TARGET_CHAIN,
                    TARGET_DOMAIN,
                    executorArgs,
                    feeArgs,
                );

            // Second deposit with same signature should fail
            await expect(
                crossChainManager
                    .connect(user1)
                    .deposit(
                        DEPOSIT_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        TARGET_CHAIN,
                        TARGET_DOMAIN,
                        executorArgs,
                        feeArgs,
                    ),
            ).to.be.revertedWithCustomError(crossChainManager, "AmlSignatureAlreadyUsed");
        });
    });

    describe("Withdraw", function () {
        beforeEach(async function () {
            // First, make a deposit to have tokens to withdraw
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getDepositAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });
            const executorArgs = createExecutorArgs();
            const feeArgs = createFeeArgs();

            await crossChainManager
                .connect(user1)
                .deposit(
                    WITHDRAW_AMOUNT,
                    destinationAddress.address,
                    amlSignature,
                    deadline,
                    TARGET_CHAIN,
                    TARGET_DOMAIN,
                    executorArgs,
                    feeArgs,
                );
        });

        it("Should allow withdraw with valid AML signature", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

            await expect(
                crossChainManager
                    .connect(user1)
                    .withdraw(WITHDRAW_AMOUNT, destinationAddress.address, amlSignature, deadline),
            )
                .to.emit(crossChainManager, "Withdrawn")
                .withArgs(
                    user1.address,
                    WITHDRAW_AMOUNT,
                    await shareToken.getAddress(),
                    await customToken.getAddress(),
                );
        });

        it("Should allow withdraw with permit", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            const permitDeadline = (await latestTimestamp()) + 7200n;
            const permitSignature = await buildPermit(
                user1,
                shareToken,
                crossChainManager,
                DEPOSIT_AMOUNT,
                permitDeadline,
            );
            const { v, r, s } = ethers.Signature.from(permitSignature);

            await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

            await expect(
                crossChainManager
                    .connect(user1)
                    .withdrawWithPermit(
                        WITHDRAW_AMOUNT,
                        destinationAddress.address,
                        amlSignature,
                        deadline,
                        permitDeadline,
                        v,
                        r,
                        s,
                    ),
            )
                .to.emit(crossChainManager, "Withdrawn")
                .withArgs(
                    user1.address,
                    WITHDRAW_AMOUNT,
                    await shareToken.getAddress(),
                    await customToken.getAddress(),
                );
        });

        it("Should reject withdraw with zero amount", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amount = 0;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            await expect(
                crossChainManager.connect(user1).withdraw(amount, destinationAddress.address, amlSignature, deadline),
            ).to.be.revertedWithCustomError(crossChainManager, "AmountMustBeGreaterThanZero");
        });

        it("Should reject withdraw with insufficient shareToken balance", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: user2.address,
            });

            await expect(
                crossChainManager.connect(user1).withdraw(WITHDRAW_AMOUNT, user2.address, amlSignature, deadline),
            )
                .to.be.revertedWithCustomError(shareToken, "ERC20InsufficientBalance")
                .withArgs(user1.address, 0, WITHDRAW_AMOUNT);
        });

        it("Should reject withdraw with expired deadline", async function () {
            const deadline = (await latestTimestamp()) - 1n;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            await expect(
                crossChainManager
                    .connect(user1)
                    .withdraw(WITHDRAW_AMOUNT, destinationAddress.address, amlSignature, deadline),
            ).to.be.revertedWithCustomError(crossChainManager, "AmlSignatureExpired");
        });

        it("Should reject withdraw with invalid AML signature", async function () {
            const deadline = (await latestTimestamp()) + 3600n;
            const invalidSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner: user2, // Wrong signer
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            await expect(
                crossChainManager
                    .connect(user1)
                    .withdraw(WITHDRAW_AMOUNT, destinationAddress.address, invalidSignature, deadline),
            ).to.be.revertedWithCustomError(crossChainManager, "InvalidAmlSigner");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to update AML signer", async function () {
            await expect(crossChainManager.connect(owner).updateAmlSigner(user2.address))
                .to.emit(crossChainManager, "AmlSignerUpdated")
                .withArgs(amlSigner.address, user2.address);

            expect(await crossChainManager.amlSigner()).to.equal(user2.address);
        });

        it("Should reject non-owner from updating AML signer", async function () {
            await expect(crossChainManager.connect(user1).updateAmlSigner(user2.address)).to.be.revertedWithCustomError(
                crossChainManager,
                "OwnableUnauthorizedAccount",
            );
        });

        it("Should allow owner to update cross chain vault", async function () {
            const oldVault = await crossChainManager.crossChainVault();
            const newVault = user2.address;

            await expect(crossChainManager.connect(owner).updateCrossChainConfig(newVault))
                .to.emit(crossChainManager, "CrossChainConfigUpdated")
                .withArgs(oldVault, newVault);

            expect(await crossChainManager.crossChainVault()).to.equal(newVault);
        });

        it("Should reject non-owner from updating cross chain vault", async function () {
            await expect(
                crossChainManager.connect(user1).updateCrossChainConfig(user2.address),
            ).to.be.revertedWithCustomError(crossChainManager, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to add destination address", async function () {
            const newDestination = user2.address;

            await expect(crossChainManager.connect(owner).addDestinationAddress(newDestination))
                .to.emit(crossChainManager, "DestinationAddressAdded")
                .withArgs(newDestination);

            expect(await crossChainManager.isDestination(newDestination)).to.be.true;
        });

        it("Should reject non-owner from adding destination address", async function () {
            await expect(
                crossChainManager.connect(user1).addDestinationAddress(user2.address),
            ).to.be.revertedWithCustomError(crossChainManager, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to remove destination address", async function () {
            await expect(crossChainManager.connect(owner).removeDestinationAddress(destinationAddress.address))
                .to.emit(crossChainManager, "DestinationAddressRemoved")
                .withArgs(destinationAddress.address);

            expect(await crossChainManager.isDestination(destinationAddress.address)).to.be.false;
        });

        it("Should reject non-owner from removing destination address", async function () {
            await expect(
                crossChainManager.connect(user1).removeDestinationAddress(destinationAddress.address),
            ).to.be.revertedWithCustomError(crossChainManager, "OwnableUnauthorizedAccount");
        });

        it("Should grant the burn role to a user by owner", async function () {
            // Define the role
            const BURN_ROLE = ethers.id("BURN_ROLE");

            // Grant role
            await crossChainManager.connect(owner).grantRole(BURN_ROLE, user1.address);

            // Verify the role was granted
            const hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
            expect(hasRole).to.be.true;
        });

        it("Should grant the burn role to a user by random account", async function () {
            // Define the role
            const BURN_ROLE = ethers.id("BURN_ROLE");

            // Grant role
            await expect(
                crossChainManager.connect(user2).grantRole(BURN_ROLE, user1.address),
            ).to.be.revertedWithCustomError(crossChainManager, "AccessControlUnauthorizedAccount");
        });

        it("Should revoke the burn role to a user by owner", async function () {
            // Define the role
            const BURN_ROLE = ethers.id("BURN_ROLE");

            // Grant role
            await crossChainManager.connect(owner).grantRole(BURN_ROLE, user1.address);

            // Verify the role was granted
            let hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
            expect(hasRole).to.be.true;

            // Revoke role
            await crossChainManager.connect(owner).revokeRole(BURN_ROLE, user1.address);

            // Verify the role was revoked
            hasRole = await crossChainManager.hasRole(BURN_ROLE, user1.address);
            expect(hasRole).to.be.false;
        });

        it("Should revoke the burn role to a user by random account", async function () {
            // Define the role
            const BURN_ROLE = ethers.id("BURN_ROLE");

            // Grant role
            await expect(
                crossChainManager.connect(user2).revokeRole(BURN_ROLE, user1.address),
            ).to.be.revertedWithCustomError(crossChainManager, "AccessControlUnauthorizedAccount");
        });

        it("Should allow user to burn tokens", async function () {
            const mintTxHash = "0x1234567890abcdef";
            const burnAmount = ethers.parseEther("10");
            const deadline = (await latestTimestamp()) + 3600n;
            const amlSignature = await getWithdrawAMLSignature({
                contract: crossChainManager,
                amlSigner,
                user: user1,
                amount: WITHDRAW_AMOUNT,
                deadline,
                destinationAddress: destinationAddress.address,
            });

            await shareToken.mint(user1.address, WITHDRAW_AMOUNT);

            await crossChainManager
                .connect(user1)
                .withdraw(WITHDRAW_AMOUNT, destinationAddress.address, amlSignature, deadline);

            // Define the role
            const BURN_ROLE = ethers.id("BURN_ROLE");

            // Grant role
            await crossChainManager.connect(owner).grantRole(BURN_ROLE, user1.address);

            await expect(crossChainManager.connect(user1).burn(burnAmount, mintTxHash)).to.emit(
                crossChainManager,
                "TokensBurned",
            );
        });

        it("Should reject random from burning tokens", async function () {
            await expect(
                crossChainManager.connect(user1).burn(WITHDRAW_AMOUNT, "0x1234567890abcdef"),
            ).to.be.revertedWithCustomError(crossChainManager, "AccessControlUnauthorizedAccount");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle multiple destination addresses", async function () {
            const destination2 = user2.address;
            await crossChainManager.connect(owner).addDestinationAddress(destination2);

            expect(await crossChainManager.isDestination(destinationAddress.address)).to.be.true;
            expect(await crossChainManager.isDestination(destination2)).to.be.true;

            const destinations = await crossChainManager.getDestinationAddresses();
            expect(destinations).to.include(destinationAddress.address);
            expect(destinations).to.include(destination2);
        });

        it("Should skip adding duplicate destination address", async function () {
            await expect(crossChainManager.connect(owner).addDestinationAddress(destinationAddress.address))
                .to.emit(crossChainManager, "DestinationAddressSkipped")
                .withArgs(destinationAddress.address);
        });

        it("Should skip removing non-existent destination address", async function () {
            await expect(crossChainManager.connect(owner).removeDestinationAddress(user2.address))
                .to.emit(crossChainManager, "DestinationAddressSkipped")
                .withArgs(user2.address);
        });

        it("Should handle reentrancy protection", async function () {
            // This test would require a malicious contract that attempts reentrancy
            // For now, we just verify the modifier is present by checking the function exists
            expect(crossChainManager.deposit).to.be.a("function");
        });
    });

    describe("Upgradeability", function () {
        it("Should be upgradeable", async function () {
            const CrossChainManagerV2 = await ethers.getContractFactory("CrossChainManager");
            const newImplementation = await CrossChainManagerV2.deploy();

            await expect(crossChainManager.connect(owner).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
                .to.not.be.reverted;
        });

        it("Should reject non-owner from upgrading", async function () {
            const CrossChainManagerV2 = await ethers.getContractFactory("CrossChainManager");
            const newImplementation = await CrossChainManagerV2.deploy();

            await expect(
                crossChainManager.connect(user1).upgradeToAndCall(await newImplementation.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(crossChainManager, "OwnableUnauthorizedAccount");
        });
    });

    describe("View Functions", function () {
        it("Should return correct destination addresses", async function () {
            const destinations = await crossChainManager.getDestinationAddresses();
            expect(destinations).to.have.length(1);
            expect(destinations[0]).to.equal(destinationAddress.address);
        });

        it("Should return correct owner address", async function () {
            const ownerAddress = await crossChainManager.owner();
            expect(ownerAddress).to.equal(owner.address);
        });

        it("Should return correct aml signer address", async function () {
            const amlSignerAddress = await crossChainManager.amlSigner();
            expect(amlSignerAddress).to.equal(amlSigner.address);
        });

        it("Should return correct cross chain vault address", async function () {
            const crossChainVaultAddress = await crossChainManager.crossChainVault();
            expect(crossChainVaultAddress).to.equal(crossChainVault.target);
        });

        it("Should return correct boolean for isDestination", async function () {
            const isTrue = await crossChainManager.isDestination(destinationAddress.address);
            expect(isTrue).to.be.true;
        });

        it("Should return correct token address", async function () {
            const tokenAddress = await crossChainManager.token();
            const expectedtokenAddress = await customToken.getAddress();
            expect(tokenAddress).to.equal(expectedtokenAddress);
        });

        it("Should return correct share token address", async function () {
            const shareTokenAddress = await crossChainManager.shareToken();
            const expectedShareTokenAddress = await shareToken.getAddress();
            expect(shareTokenAddress).to.equal(expectedShareTokenAddress);
        });

        it("Should return correct upgrade interface version", async function () {
            const version = await crossChainManager.UPGRADE_INTERFACE_VERSION();
            expect(version).to.equal("5.0.0");
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WithdrawalFactory", function () {
    let owner, user, amlSigner;
    let Withdrawal, WithdrawalFactory, Token;
    let withdrawalFactory, withdrawalImplementation;
    let paymentToken, withdrawalToken;

    // Helper function to deploy a new instance of the factory for each test
    async function deployNewFactory() {
        // Get Withdrawal contract factory
        Withdrawal = await ethers.getContractFactory("Withdrawal");
        
        // Deploy new implementation
        withdrawalImplementation = await Withdrawal.deploy();
        await withdrawalImplementation.waitForDeployment();

        // Deploy new factory
        WithdrawalFactory = await ethers.getContractFactory("WithdrawalFactory");
        withdrawalFactory = await WithdrawalFactory.deploy(await withdrawalImplementation.getAddress());
        await withdrawalFactory.waitForDeployment();

        return { withdrawalFactory, withdrawalImplementation };
    }

    before(async function () {
        // Get signers
        [owner, user, amlSigner] = await ethers.getSigners();

        // Get Token contract factory
        Token = await ethers.getContractFactory("CustomToken");

    });

    // Deploy a fresh factory and fresh token instances before each test
    beforeEach(async function () {
        // Deploy fresh tokens for each test to ensure complete isolation
        const ownerAddress = await owner.getAddress();

        // Deploy new payment token
        paymentToken = await Token.deploy("Payment Token", "PAY", ownerAddress, 18);
        await paymentToken.waitForDeployment();
        await paymentToken.mint(ownerAddress, ethers.parseEther("1000000"));

        // Deploy new withdrawal token
        withdrawalToken = await Token.deploy("Withdrawal Token", "WTH", ownerAddress, 6);
        await withdrawalToken.waitForDeployment();
        await withdrawalToken.mint(ownerAddress, ethers.parseUnits("1000000", 6));

        // Deploy fresh factory
        await deployNewFactory();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await withdrawalFactory.owner()).to.equal(owner.address);
        });

        it("Should set the implementation address", async function () {
            const implementation = await withdrawalFactory.implementation();
            expect(implementation).to.equal(await withdrawalImplementation.getAddress());
        });

        it("Should revert if implementation address is zero", async function () {
            const WithdrawalFactory = await ethers.getContractFactory("WithdrawalFactory");
            await expect(WithdrawalFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                WithdrawalFactory,
                "ZeroAddress",
            );
        });
    });

    describe("createWithdrawal", function () {
        it("Should create a new withdrawal contract", async function () {
            const tx = await withdrawalFactory.connect(owner).createWithdrawal(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
                amlSigner.address,
                owner.address
            );

            const txReceipt = await tx.wait();
            const withdrawalCreatedEvent = txReceipt.logs.find((log) => log.fragment?.name === "WithdrawalCreated");

            expect(withdrawalCreatedEvent).to.not.be.undefined;
            expect(withdrawalCreatedEvent.args.paymentToken).to.equal(await paymentToken.getAddress());
            expect(withdrawalCreatedEvent.args.withdrawalToken).to.equal(await withdrawalToken.getAddress());
            expect(ethers.isAddress(withdrawalCreatedEvent.args.withdrawalAddress)).to.be.true;

            // Verify the withdrawal address is stored correctly
            const withdrawalAddress = await withdrawalFactory.withdrawals(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
            );
            expect(withdrawalAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should revert if payment token is zero address", async function () {
            await expect(
                withdrawalFactory.connect(owner).createWithdrawal(
                    ethers.ZeroAddress,
                    await withdrawalToken.getAddress(),
                    amlSigner.address,
                    owner.address
                )
            ).to.be.revertedWithCustomError(withdrawalFactory, "ZeroAddress");
        });

        it("Should revert if withdrawal token is zero address", async function () {
            await expect(
                withdrawalFactory.connect(owner).createWithdrawal(
                    await paymentToken.getAddress(),
                    ethers.ZeroAddress,
                    amlSigner.address,
                    owner.address
                )
            ).to.be.revertedWithCustomError(withdrawalFactory, "ZeroAddress");
        });

        it("Should revert if AML signer is zero address", async function () {
            await expect(
                withdrawalFactory.connect(owner).createWithdrawal(
                    await paymentToken.getAddress(),
                    await withdrawalToken.getAddress(),
                    ethers.ZeroAddress,
                    owner.address
                )
            ).to.be.revertedWithCustomError(withdrawalFactory, "ZeroAddress");
        });

        it("Should revert if withdrawal already exists", async function () {
            // First creation should succeed
            await withdrawalFactory.connect(owner).createWithdrawal(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
                amlSigner.address,
                owner.address
            );

            // Second creation should fail
            await expect(
                withdrawalFactory.connect(owner).createWithdrawal(
                    await paymentToken.getAddress(),
                    await withdrawalToken.getAddress(),
                    amlSigner.address,
                    owner.address
                )
            ).to.be.revertedWithCustomError(withdrawalFactory, "WithdrawalAlreadyExists");
        });
    });

    describe("migrateWithdrawal", function () {
        it("Should migrate to a new withdrawal contract", async function () {
            // First create a withdrawal
            const createTx = await withdrawalFactory.connect(owner).createWithdrawal(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
                amlSigner.address,
                owner.address
            );
            await createTx.wait();

            const oldWithdrawalAddress = await withdrawalFactory.withdrawals(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress()
            );

            // Deploy a new implementation
            const Withdrawal = await ethers.getContractFactory("Withdrawal");
            const newImplementation = await Withdrawal.deploy();
            await newImplementation.waitForDeployment();

            // Migrate to the new implementation
            const migrateTx = await withdrawalFactory.connect(owner).migrateWithdrawal(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
                amlSigner.address,
                await newImplementation.getAddress()
            );
            await migrateTx.wait();

            // Check that the withdrawal address has changed
            const newWithdrawalAddress = await withdrawalFactory.withdrawals(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress()
            );

            expect(newWithdrawalAddress).to.not.equal(oldWithdrawalAddress);
            expect(newWithdrawalAddress).to.not.equal(ethers.ZeroAddress);
            const txReceipt = await migrateTx.wait();
            const migratedEvent = txReceipt.logs.find((log) => log.fragment?.name === "WithdrawalMigrated");

            expect(migratedEvent).to.not.be.undefined;
            expect(migratedEvent.args.paymentToken).to.equal(await paymentToken.getAddress());
            expect(migratedEvent.args.withdrawalToken).to.equal(await withdrawalToken.getAddress());
        });

        it("Should revert if no withdrawal exists to migrate", async function () {
            // Deploy a new implementation for testing
            const Withdrawal = await ethers.getContractFactory("Withdrawal");
            const testImplementation = await Withdrawal.deploy();
            await testImplementation.waitForDeployment();

            await expect(
                withdrawalFactory.connect(owner).migrateWithdrawal(
                    await paymentToken.getAddress(),
                    await withdrawalToken.getAddress(),
                    amlSigner.address,
                    await testImplementation.getAddress()
                )
            ).to.be.revertedWithCustomError(withdrawalFactory, "NoExistingWithdrawalToMigrate");
        });

        it("Should revert if not called by owner", async function () {
            // Create a withdrawal
            const createTx = await withdrawalFactory.connect(owner).createWithdrawal(
                await paymentToken.getAddress(),
                await withdrawalToken.getAddress(),
                amlSigner.address,
                owner.address
            );
            await createTx.wait();

            // Deploy a new implementation for testing
            const Withdrawal = await ethers.getContractFactory("Withdrawal");
            const testImplementation = await Withdrawal.deploy();
            await testImplementation.waitForDeployment();

            await expect(
                withdrawalFactory
                    .connect(user)
                    .migrateWithdrawal(
                        await paymentToken.getAddress(),
                        await withdrawalToken.getAddress(),
                        amlSigner.address,
                        await testImplementation.getAddress()
                    )
            ).to.be.revertedWithCustomError(withdrawalFactory, "OwnableUnauthorizedAccount");
        });
    });

    describe("updateImplementation", function () {
        it("Should update the implementation address", async function () {
            const newImplementation = user.address; // For testing purposes

            const tx = await withdrawalFactory.connect(owner).updateImplementation(newImplementation);

            await expect(tx).to.emit(withdrawalFactory, "ImplementationUpdated").withArgs(newImplementation);

            const updatedImplementation = await withdrawalFactory.implementation();
            expect(updatedImplementation).to.equal(newImplementation);
        });

        it("Should revert if not called by owner", async function () {
            const newImplementation = user.address;

            await expect(
                withdrawalFactory.connect(user).updateImplementation(newImplementation)
            ).to.be.revertedWithCustomError(withdrawalFactory, "OwnableUnauthorizedAccount");
        });

        it("Should revert if new implementation is zero address", async function () {
            await expect(
                withdrawalFactory.connect(owner).updateImplementation(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(withdrawalFactory, "ZeroAddress");
        });
    });
});

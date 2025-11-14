const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DepositorFactory", function () {
    let owner, user, amlSigner;
    let Depositor, DepositorFactory, Token;
    let depositorFactory, depositorImplementation;
    let shareToken, depositToken;

    before(async function () {
        // Get signers
        [owner, user, amlSigner] = await ethers.getSigners();

        // Deploy implementation contract
        Depositor = await ethers.getContractFactory("Depositor");
        depositorImplementation = await Depositor.deploy();
        await depositorImplementation.waitForDeployment();

        // Deploy factory
        DepositorFactory = await ethers.getContractFactory("DepositorFactory");
        depositorFactory = await DepositorFactory.deploy(await depositorImplementation.getAddress());
        await depositorFactory.waitForDeployment();

        // Deploy test tokens
        Token = await ethers.getContractFactory("CustomToken");

        // Deploy share token with 18 decimals
        const ownerAddress = await owner.getAddress();
        shareToken = await Token.deploy("Share Token", "SHR", ownerAddress, 18);
        await shareToken.waitForDeployment();

        // Mint some tokens to the owner for testing
        await shareToken.mint(ownerAddress, ethers.parseEther("1000000"));

        // Deploy deposit token with 6 decimals (like USDC)
        depositToken = await Token.deploy("Deposit Token", "USDC", ownerAddress, 6);
        await depositToken.waitForDeployment();

        // Mint some tokens to the owner for testing
        await depositToken.mint(ownerAddress, ethers.parseUnits("1000000", 6));
    });

    it("should deploy with correct implementation", async function () {
        const implementation = await depositorFactory.implementation();
        expect(implementation).to.equal(await depositorImplementation.getAddress());
    });

    it("should create a new depositor", async function () {
        const tx = await depositorFactory.createDepositor(
            await shareToken.getAddress(),
            await depositToken.getAddress(),
            await amlSigner.getAddress(),
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "DepositorCreated");

        expect(event).to.exist;
        expect(event.args.shareToken).to.equal(await shareToken.getAddress());
        expect(event.args.depositToken).to.equal(await depositToken.getAddress());

        const depositorAddress = await depositorFactory.depositors(
            await shareToken.getAddress(),
            await depositToken.getAddress(),
        );

        expect(depositorAddress).to.not.equal(ethers.ZeroAddress);

        // Verify the depositor is initialized correctly
        const depositor = Depositor.attach(depositorAddress);
        expect(await depositor.shareToken()).to.equal(await shareToken.getAddress());
        expect(await depositor.depositToken()).to.equal(await depositToken.getAddress());
        expect(await depositor.amlSigner()).to.equal(await amlSigner.getAddress());
    });

    it("should not allow creating duplicate depositor", async function () {
        await expect(
            depositorFactory.createDepositor(
                await shareToken.getAddress(),
                await depositToken.getAddress(),
                await amlSigner.getAddress(),
            ),
        ).to.be.revertedWithCustomError(depositorFactory, "DepositorAlreadyExists");
    });

    it("should not allow zero addresses in createDepositor", async function () {
        await expect(
            depositorFactory.createDepositor(
                ethers.ZeroAddress,
                await depositToken.getAddress(),
                await amlSigner.getAddress(),
            ),
        ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");

        await expect(
            depositorFactory.createDepositor(
                await shareToken.getAddress(),
                ethers.ZeroAddress,
                await amlSigner.getAddress(),
            ),
        ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");

        await expect(
            depositorFactory.createDepositor(
                await shareToken.getAddress(),
                await depositToken.getAddress(),
                ethers.ZeroAddress,
            ),
        ).to.be.revertedWithCustomError(depositorFactory, "ZeroAddress");
    });

    it("should allow owner to update implementation", async function () {
        // Deploy new implementation
        const newImplementation = await Depositor.deploy();
        await newImplementation.waitForDeployment();

        const tx = await depositorFactory.updateImplementation(await newImplementation.getAddress());
        await expect(tx)
            .to.emit(depositorFactory, "ImplementationUpdated")
            .withArgs(await newImplementation.getAddress());

        expect(await depositorFactory.implementation()).to.equal(await newImplementation.getAddress());
    });

    it("should not allow non-owner to update implementation", async function () {
        const newImplementation = await Depositor.deploy();
        await newImplementation.waitForDeployment();

        await expect(
            depositorFactory.connect(user).updateImplementation(await newImplementation.getAddress()),
        ).to.be.revertedWithCustomError(depositorFactory, "OwnableUnauthorizedAccount");
    });

    it("should migrate to new depositor implementation", async function () {
        // Deploy new implementation
        const newImplementation = await Depositor.deploy();
        await newImplementation.waitForDeployment();

        // Update implementation in factory
        await depositorFactory.updateImplementation(await newImplementation.getAddress());

        // Migrate the existing depositor
        const tx = await depositorFactory.migrateDepositor(
            await shareToken.getAddress(),
            await depositToken.getAddress(),
            await amlSigner.getAddress(),
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "DepositorMigrated");

        expect(event).to.exist;
        expect(event.args.shareToken).to.equal(await shareToken.getAddress());
        expect(event.args.depositToken).to.equal(await depositToken.getAddress());

        const newDepositorAddress = await depositorFactory.depositors(
            await shareToken.getAddress(),
            await depositToken.getAddress(),
        );

        // Verify the new depositor is using the new implementation
        const newDepositor = Depositor.attach(newDepositorAddress);
        expect(await newDepositor.shareToken()).to.equal(await shareToken.getAddress());
    });

    it("should not allow migrating non-existent depositor", async function () {
        const ownerAddress = await owner.getAddress();
        const newShareToken = await Token.deploy("New Share", "NSHR", ownerAddress, 18);
        await newShareToken.waitForDeployment();

        await expect(
            depositorFactory.migrateDepositor(
                await newShareToken.getAddress(),
                await depositToken.getAddress(),
                await amlSigner.getAddress(),
            ),
        ).to.be.revertedWithCustomError(depositorFactory, "NoExistingDepositorToMigrate");
    });
});

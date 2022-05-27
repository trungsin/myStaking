const { expect } = require("chai");
const { ethers } = require("hardhat");
describe("Reserve", function () {
const [admin, staker, staker2] = [];
let gold
    let reserve
    let staking
    let address0 = "0x0000000000000000000000000000000000000000"
    let reserveBalance = ethers.utils.parseEther("1000000")
    let stakerBalance = ethers.utils.parseEther("1000000")
    let oneWeek = 86400 * 7
    let oneYear = 86400 * 365
    let defaultRate = 158548 // 0.00000158548% / second = 50%/year
    let defaultDecimal = 13
    let defaultMinStaking = ethers.utils.parseEther('100')
    let defaultStakeAmount = ethers.utils.parseEther('10000')
    beforeEach(async () => {
        [admin, staker, staker2] = await ethers.getSigners();
        const Gold = await ethers.getContractFactory("Gold");
        gold = await Gold.deploy()
        await gold.deployed()
        const Staking = await ethers.getContractFactory("Staking");
        staking = await Staking.deploy(gold.address)
        await staking.deployed()
        const Reserve = await ethers.getContractFactory("StakingReserve");
        reserve = await Reserve.deploy(gold.address, staking.address)
        await reserve.deployed()
        await staking.setReserve(reserve.address)
        await gold.transfer(staker.address, stakerBalance)
        await gold.transfer(reserve.address, reserveBalance)
        await gold.connect(staker).approve(staking.address, defaultStakeAmount.mul(4))
    })
    describe("setReserve", function () {
        it("should revert if reserveAddress is address 0", async function () {
            await expect(staking.setReserve(address0))
                .to
                .be
                .revertedWith("Staking: Invalid reserve address")
        });
        it("should revert if sender isn't contract owner", async function () {
            await expect(staking.connect(staker2).setReserve(address0))
                .to
                .be
                .revertedWith("Ownable: caller is not the owner")
        });
        it("should update correctly", async function () {
            await staking.setReserve(staker2.address)
            expect(await staking.reserve()).to.be.equal(staker2.address)
        });
    })
    describe("addStakePackage", function () {
        it("should revert if minStaking_ = 0", async function () {
            await expect(staking.addStakePackage(defaultRate, defaultDecimal, 0, oneYear)).to.be
                .revertedWith("Staking: Invalid min stake amount")
        })
        it("should revert if rate_ = 0", async function () {
            await expect(staking.addStakePackage(0, defaultDecimal, 1, oneYear)).to.be
                .revertedWith("Staking: Invalid rate")
        })
        it("should revert if lockTime_ = 0", async function () {
            await expect(staking.addStakePackage(defaultRate, defaultDecimal, 1, 0)).to.be
                .revertedWith("Staking: Invalid lockTime_")
        })
        it("should revert if sender is not owner", async function () {
            await expect(staking.connect(staker2).addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)).to.be
                .revertedWith("Ownable: caller is not the owner")
        })
        it("should add stake package correctly", async function () {
            await staking.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)
            const stakePackage = await staking.stakePackages(1)
            expect(stakePackage.rate).to.be.equal(defaultRate)
            expect(stakePackage.decimal).to.be.equal(defaultDecimal)
            expect(stakePackage.minStaking).to.be.equal(defaultMinStaking)
            expect(stakePackage.lockTime).to.be.equal(oneYear)

        })
    })
    describe("removeStakePackage", function () {
        it("should revert if minStaking = 0", async function () {
            await expect(staking.removeStakePackage(1)).to.be.revertedWith("Staking: Stake package non-existence")
        })
        it("should revert if stake package was offline", async function () {
            await staking.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)
            await staking.removeStakePackage(1)
            await expect(staking.removeStakePackage(1)).to.be.revertedWith("Staking: Invalid stake package")

        })
        it("should remove correctly", async function () {
            await staking.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)
            await staking.removeStakePackage(1)
            const stakePackage = await staking.stakePackages(0)
            expect(stakePackage.rate).to.be.equal(0)
            expect(stakePackage.decimal).to.be.equal(0)
            expect(stakePackage.minStaking).to.be.equal(0)
            expect(stakePackage.lockTime).to.be.equal(0)
        })
    })
    describe("stake", function () {
        beforeEach(async () => {
            await staking.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)
        })
        it("should revert if amount < min staking", async function () {
            await expect(staking.stake(defaultMinStaking.sub(1), 1)).to.be.revertedWith("Staking: stake amount must greater than min stake")
        })
        it("should revert if invalid package", async function () {
            await expect(staking.stake(defaultMinStaking, 0)).to.be.revertedWith("Staking: Stake package non-existence")
        })
        it("should revert if package is offline", async function () {
            await staking.removeStakePackage(1)
            await expect(staking.stake(defaultMinStaking, 0)).to.be.revertedWith("Staking: Stake package non-existence")
        })
        it("should add stake correctly to a new stake info ", async function () {
            let stakeTx = await staking.connect(staker).stake(defaultStakeAmount, 1)
            let stakeInfo = await staking.stakes(staker.address, 1)
            const blockNum = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNum);
            expect(stakeInfo.amount).to.be.equal(defaultStakeAmount)
            expect(stakeInfo.startTime).to.be.equal(block.timestamp)
            expect(stakeInfo.timePoint).to.be.equal(block.timestamp)
            expect(stakeInfo.totalProfit).to.be.equal(0)
            await expect(stakeTx).to.emit(staking, 'StakeUpdate')
                .withArgs(staker.address, 1, defaultStakeAmount, 0);
        })
        it("should add stake correctly to a existence stake info ", async function () {
            await staking.connect(staker).stake(defaultStakeAmount, 1)
            const startBlockNum = await ethers.provider.getBlockNumber();
            const startBlock = await ethers.provider.getBlock(startBlockNum);
            await network.provider.send("evm_increaseTime", [oneYear])
            let stakeTx = await staking.connect(staker).stake(defaultStakeAmount, 1)
            let stakeInfo = await staking.stakes(staker.address, 1)
            const blockNum = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNum);
            expect(stakeInfo.amount).to.be.equal(defaultStakeAmount.add(defaultStakeAmount))
            expect(stakeInfo.startTime).to.be.equal(startBlock.timestamp)
            expect(stakeInfo.timePoint).to.be.equal(block.timestamp)
            let profit = defaultStakeAmount.mul(oneYear).mul(defaultRate).div(10 ** defaultDecimal)
            expect(stakeInfo.totalProfit).to.be.equal(profit)
            console.log(await ethers.utils.formatEther(profit))
            await expect(stakeTx).to.emit(staking, 'StakeUpdate')
                .withArgs(staker.address, 1, defaultStakeAmount.mul(2), stakeInfo.totalProfit);
            expect(await gold.balanceOf(staker.address)).to.be.equal(stakerBalance.sub(defaultStakeAmount).sub(defaultStakeAmount))
            expect(await gold.balanceOf(reserve.address)).to.be.equal(reserveBalance.add(defaultStakeAmount).add(defaultStakeAmount))
        })
    })
    describe("unStake", function () {
        beforeEach(async () => {
            await staking.addStakePackage(defaultRate, defaultDecimal, defaultMinStaking, oneYear)
            await staking.connect(staker).stake(defaultStakeAmount, 1)
        })
        it("should revert if package not exist", async function () {
            await expect(staking.connect(staker).unStake(0)).to.be.revertedWith("Staking: Invalid stake")

        })
        it("should revert if not reach lock time", async function () {
            await network.provider.send("evm_increaseTime", [oneYear - 1])
            await expect(staking.connect(staker).unStake(1)).to.be.revertedWith("Staking: Not reach lock time")
        })
        it("should revert if not reach lock time 2", async function () {
            await network.provider.send("evm_increaseTime", [oneYear + 1])
            await staking.connect(staker).stake(defaultStakeAmount, 1)
            await expect(staking.connect(staker).unStake(1)).to.be.revertedWith("Staking: Not reach lock time")
        })
        it("should unstake correctly", async function () {
            await network.provider.send("evm_increaseTime", [oneYear])
            let unstakeTx = await staking.connect(staker).unStake(1)
            let profit = defaultStakeAmount.mul(oneYear).mul(defaultRate).div(10 ** defaultDecimal)
            await expect(unstakeTx).to.emit(staking, 'StakeReleased')
                .withArgs(staker.address, 1, defaultStakeAmount, profit);
            expect(await gold.balanceOf(staker.address)).to.be.equal(stakerBalance.add(profit))
            expect(await gold.balanceOf(reserve.address)).to.be.equal(reserveBalance.sub(profit))

        })
        it("should unstake correctly", async function () {
            await network.provider.send("evm_increaseTime", [oneYear])
            await staking.connect(staker).stake(defaultStakeAmount, 1)
            await network.provider.send("evm_increaseTime", [oneWeek])
            await staking.connect(staker).stake(defaultStakeAmount, 1)
            await network.provider.send("evm_increaseTime", [oneYear])
            await staking.connect(staker).stake(defaultStakeAmount, 1)
            await network.provider.send("evm_increaseTime", [oneYear])
            let unstakeTx = await staking.connect(staker).unStake(1)
            let profit = defaultStakeAmount.mul(oneYear).mul(defaultRate).div(10 ** defaultDecimal)
                .add(defaultStakeAmount.mul(2).mul(oneWeek).mul(defaultRate).div(10 ** defaultDecimal))
                .add(defaultStakeAmount.mul(3).mul(oneYear).mul(defaultRate).div(10 ** defaultDecimal))
                .add(defaultStakeAmount.mul(4).mul(oneYear).mul(defaultRate).div(10 ** defaultDecimal))
            await expect(unstakeTx).to.emit(staking, 'StakeReleased')
                .withArgs(staker.address, 1, defaultStakeAmount.mul(4), profit);
            expect(await gold.balanceOf(staker.address)).to.be.equal(stakerBalance.add(profit))
            expect(await gold.balanceOf(reserve.address)).to.be.equal(reserveBalance.sub(profit))

        })
    })
})
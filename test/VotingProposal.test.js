const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProposalVoting", function () {
  let proposalVoting;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // Deploy contract
    const ProposalVoting = await ethers.getContractFactory("ProposalVoting");
    proposalVoting = await ProposalVoting.deploy();
    await proposalVoting.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await proposalVoting.owner()).to.equal(owner.address);
    });

    it("Should mint initial tokens to owner", async function () {
      expect(await proposalVoting.balances(owner.address)).to.equal(10000);
      expect(await proposalVoting.totalSupply()).to.equal(10000);
    });

    it("Should set correct constants", async function () {
      expect(await proposalVoting.MIN_TOKENS_TO_PROPOSE()).to.equal(100);
      expect(await proposalVoting.VOTING_THRESHOLD()).to.equal(5000);
      expect(await proposalVoting.BASIS_POINTS()).to.equal(10000);
    });
  });

  describe("Token Functions", function () {
    describe("Minting", function () {
      it("Should allow owner to mint tokens", async function () {
        await proposalVoting.mint(addr1.address, 500);
        expect(await proposalVoting.balances(addr1.address)).to.equal(500);
        expect(await proposalVoting.totalSupply()).to.equal(10500);
      });

      it("Should emit TokensMinted event", async function () {
        await expect(proposalVoting.mint(addr1.address, 500))
          .to.emit(proposalVoting, "TokensMinted")
          .withArgs(addr1.address, 500);
      });

      it("Should reject minting by non-owner", async function () {
        await expect(
          proposalVoting.connect(addr1).mint(addr2.address, 500)
        ).to.be.revertedWith("Only owner can call this function");
      });

      it("Should reject minting to zero address", async function () {
        await expect(
          proposalVoting.mint(ethers.ZeroAddress, 500)
        ).to.be.revertedWith("Cannot mint to zero address");
      });

      it("Should reject minting zero amount", async function () {
        await expect(
          proposalVoting.mint(addr1.address, 0)
        ).to.be.revertedWith("Amount must be greater than zero");
      });
    });

    describe("Transfers", function () {
      beforeEach(async function () {
        await proposalVoting.mint(addr1.address, 1000);
      });

      it("Should transfer tokens successfully", async function () {
        await proposalVoting.connect(addr1).transfer(addr2.address, 300);
        expect(await proposalVoting.balances(addr1.address)).to.equal(700);
        expect(await proposalVoting.balances(addr2.address)).to.equal(300);
      });

      it("Should reject transfer with insufficient balance", async function () {
        await expect(
          proposalVoting.connect(addr1).transfer(addr2.address, 2000)
        ).to.be.revertedWith("Insufficient balance");
      });

      it("Should reject transfer to zero address", async function () {
        await expect(
          proposalVoting.connect(addr1).transfer(ethers.ZeroAddress, 100)
        ).to.be.revertedWith("Cannot transfer to zero address");
      });
    });
  });

  describe("Proposal Creation", function () {
    beforeEach(async function () {
      // Give addr1 enough tokens to create proposals
      await proposalVoting.mint(addr1.address, 500);
    });

    it("Should create a proposal successfully", async function () {
      const description = "Should we implement feature X?";
      const votingPeriod = 7 * 24 * 60 * 60; // 7 days

      await proposalVoting.connect(addr1).createProposal(description, votingPeriod);

      expect(await proposalVoting.proposalCount()).to.equal(1);
      
      const proposal = await proposalVoting.getProposal(1);
      expect(proposal.description).to.equal(description);
      expect(proposal.proposer).to.equal(addr1.address);
      expect(proposal.yesVotes).to.equal(0);
      expect(proposal.noVotes).to.equal(0);
      expect(proposal.executed).to.equal(false);
      expect(proposal.status).to.equal(0); // ProposalStatus.Active
    });

    it("Should emit ProposalCreated event", async function () {
      const description = "Should we implement feature X?";
      const votingPeriod = 7 * 24 * 60 * 60;

      const tx = await proposalVoting.connect(addr1).createProposal(description, votingPeriod);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedDeadline = block.timestamp + votingPeriod;

      await expect(tx)
        .to.emit(proposalVoting, "ProposalCreated")
        .withArgs(1, addr1.address, description, expectedDeadline);
    });

    it("Should reject proposal creation with insufficient tokens", async function () {
      await expect(
        proposalVoting.connect(addr2).createProposal("Test proposal", 3600)
      ).to.be.revertedWith("Insufficient tokens to create proposal");
    });

    it("Should reject empty description", async function () {
      await expect(
        proposalVoting.connect(addr1).createProposal("", 3600)
      ).to.be.revertedWith("Description cannot be empty");
    });

    it("Should reject voting period less than 60 seconds", async function () {
      await expect(
        proposalVoting.connect(addr1).createProposal("Test", 30)
      ).to.be.revertedWith("Voting period must be at least 60 seconds");
    });

    it("Should reject voting period exceeding 30 days", async function () {
      const moreThan30Days = 31 * 24 * 60 * 60;
      await expect(
        proposalVoting.connect(addr1).createProposal("Test", moreThan30Days)
      ).to.be.revertedWith("Voting period cannot exceed 30 days");
    });
  });

  describe("Voting", function () {
    let proposalId;
    const votingPeriod = 3600; // 1 hour

    beforeEach(async function () {
      // Setup: Mint tokens and create a proposal
      await proposalVoting.mint(addr1.address, 500);
      await proposalVoting.mint(addr2.address, 300);
      await proposalVoting.mint(addr3.address, 200);

      const tx = await proposalVoting.connect(addr1).createProposal("Test Proposal", votingPeriod);
      proposalId = 1;
    });

    it("Should allow voting with tokens", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      
      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(500);
      expect(proposal.noVotes).to.equal(0);
    });

    it("Should record yes votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, true);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(800); // 500 + 300
    });

    it("Should record no votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, false);
      await proposalVoting.connect(addr2).vote(proposalId, false);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.noVotes).to.equal(800); // 500 + 300
    });

    it("Should record mixed votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, false);
      await proposalVoting.connect(addr3).vote(proposalId, true);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(700); // 500 + 200
      expect(proposal.noVotes).to.equal(300);
    });

    it("Should emit VoteCast event", async function () {
      await expect(proposalVoting.connect(addr1).vote(proposalId, true))
        .to.emit(proposalVoting, "VoteCast")
        .withArgs(proposalId, addr1.address, true, 500);
    });

    it("Should prevent double voting", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      
      await expect(
        proposalVoting.connect(addr1).vote(proposalId, false)
      ).to.be.revertedWith("Already voted on this proposal");
    });

    it("Should prevent voting without tokens", async function () {
      const [, , , , noTokensAddr] = await ethers.getSigners();
      
      await expect(
        proposalVoting.connect(noTokensAddr).vote(proposalId, true)
      ).to.be.revertedWith("Must have tokens to vote");
    });

    it("Should prevent voting on non-existent proposal", async function () {
      await expect(
        proposalVoting.connect(addr1).vote(999, true)
      ).to.be.revertedWith("Proposal does not exist");
    });

    it("Should prevent voting after deadline", async function () {
      // Fast forward time past the deadline
      await time.increase(votingPeriod + 1);

      await expect(
        proposalVoting.connect(addr1).vote(proposalId, true)
      ).to.be.revertedWith("Voting period has ended");
    });

    it("Should track hasVoted correctly", async function () {
      expect(await proposalVoting.hasVotedOnProposal(proposalId, addr1.address)).to.equal(false);
      
      await proposalVoting.connect(addr1).vote(proposalId, true);
      
      expect(await proposalVoting.hasVotedOnProposal(proposalId, addr1.address)).to.equal(true);
    });
  });

  describe("Proposal Execution", function () {
    let proposalId;
    const votingPeriod = 3600; // 1 hour

    beforeEach(async function () {
      // Setup: Mint tokens and create a proposal
      await proposalVoting.mint(addr1.address, 600);
      await proposalVoting.mint(addr2.address, 400);

      await proposalVoting.connect(addr1).createProposal("Test Proposal", votingPeriod);
      proposalId = 1;
    });

    it("Should execute proposal that passes threshold", async function () {
      // 600 yes votes out of 1000 total = 60% > 50% threshold
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, false);

      // Fast forward past deadline
      await time.increase(votingPeriod + 1);

      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.executed).to.equal(true);
      expect(proposal.status).to.equal(3); // ProposalStatus.Executed
    });

    it("Should fail proposal that doesn't meet threshold", async function () {
      // 400 yes votes out of 1000 total = 40% < 50% threshold
      await proposalVoting.connect(addr1).vote(proposalId, false);
      await proposalVoting.connect(addr2).vote(proposalId, true);

      // Fast forward past deadline
      await time.increase(votingPeriod + 1);

      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.executed).to.equal(true);
      expect(proposal.status).to.equal(2); // ProposalStatus.Failed
    });

    it("Should emit ProposalExecuted event", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await time.increase(votingPeriod + 1);

      await expect(proposalVoting.executeProposal(proposalId))
        .to.emit(proposalVoting, "ProposalExecuted")
        .withArgs(proposalId, true);
    });

    it("Should prevent execution before deadline", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);

      await expect(
        proposalVoting.executeProposal(proposalId)
      ).to.be.revertedWith("Voting period has not ended");
    });

    it("Should prevent double execution", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await time.increase(votingPeriod + 1);

      await proposalVoting.executeProposal(proposalId);

      await expect(
        proposalVoting.executeProposal(proposalId)
      ).to.be.revertedWith("Proposal already executed");
    });

    it("Should handle 50% threshold as pass", async function () {
      // Exactly 50% should pass
      await proposalVoting.mint(addr3.address, 1000);
      await proposalVoting.connect(addr1).vote(proposalId, true); // 600
      await proposalVoting.connect(addr2).vote(proposalId, true); // 400
      await proposalVoting.connect(addr3).vote(proposalId, false); // 1000
      // Total: 1000 yes, 1000 no = 50%

      await time.increase(votingPeriod + 1);
      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.status).to.equal(3); // Should pass at exactly 50%
    });
  });

  describe("View Functions", function () {
    it("Should return correct voting power", async function () {
      await proposalVoting.mint(addr1.address, 750);
      expect(await proposalVoting.getVotingPower(addr1.address)).to.equal(750);
    });

    it("Should return correct vote counts", async function () {
      await proposalVoting.mint(addr1.address, 500);
      await proposalVoting.mint(addr2.address, 300);
      
      await proposalVoting.connect(addr1).createProposal("Test", 3600);
      await proposalVoting.connect(addr1).vote(1, true);
      await proposalVoting.connect(addr2).vote(1, false);

      const [yesVotes, noVotes, totalVotes] = await proposalVoting.getVoteCounts(1);
      expect(yesVotes).to.equal(500);
      expect(noVotes).to.equal(300);
      expect(totalVotes).to.equal(800);
    });

    it("Should check if voting is active", async function () {
      await proposalVoting.mint(addr1.address, 500);
      await proposalVoting.connect(addr1).createProposal("Test", 3600);

      expect(await proposalVoting.isVotingActive(1)).to.equal(true);

      await time.increase(3601);
      expect(await proposalVoting.isVotingActive(1)).to.equal(false);
    });
  });
});
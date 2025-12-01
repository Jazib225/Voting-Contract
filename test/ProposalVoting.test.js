const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProposalVoting with OpenZeppelin", function () {
  let proposalVoting;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  // Helper function to convert to token units (18 decimals)
  const tokens = (amount) => ethers.parseEther(amount.toString());

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const ProposalVoting = await ethers.getContractFactory("ProposalVoting");
    proposalVoting = await ProposalVoting.deploy();
    await proposalVoting.waitForDeployment();
  });

  describe("Deployment & ERC20 Standard", function () {
    it("Should set the right owner", async function () {
      expect(await proposalVoting.owner()).to.equal(owner.address);
    });

    it("Should have correct token name and symbol (ERC20)", async function () {
      expect(await proposalVoting.name()).to.equal("GovernanceToken");
      expect(await proposalVoting.symbol()).to.equal("GOV");
    });

    it("Should have 18 decimals (ERC20 standard)", async function () {
      expect(await proposalVoting.decimals()).to.equal(18);
    });

    it("Should mint initial tokens to owner", async function () {
      expect(await proposalVoting.balanceOf(owner.address)).to.equal(tokens(10000));
      expect(await proposalVoting.totalSupply()).to.equal(tokens(10000));
    });

    it("Should set correct constants", async function () {
      expect(await proposalVoting.MIN_TOKENS_TO_PROPOSE()).to.equal(tokens(100));
      expect(await proposalVoting.VOTING_THRESHOLD()).to.equal(5000);
      expect(await proposalVoting.BASIS_POINTS()).to.equal(10000);
    });
  });

  describe("ERC20 Token Functions", function () {
    describe("Minting", function () {
      it("Should allow owner to mint tokens", async function () {
        await proposalVoting.mint(addr1.address, tokens(500));
        expect(await proposalVoting.balanceOf(addr1.address)).to.equal(tokens(500));
        expect(await proposalVoting.totalSupply()).to.equal(tokens(10500));
      });

      it("Should reject minting by non-owner (OpenZeppelin Ownable)", async function () {
        await expect(
          proposalVoting.connect(addr1).mint(addr2.address, tokens(500))
        ).to.be.revertedWithCustomError(proposalVoting, "OwnableUnauthorizedAccount");
      });
    });

    describe("ERC20 Transfers", function () {
      beforeEach(async function () {
        await proposalVoting.mint(addr1.address, tokens(1000));
      });

      it("Should transfer tokens successfully (ERC20)", async function () {
        await proposalVoting.connect(addr1).transfer(addr2.address, tokens(300));
        expect(await proposalVoting.balanceOf(addr1.address)).to.equal(tokens(700));
        expect(await proposalVoting.balanceOf(addr2.address)).to.equal(tokens(300));
      });

      it("Should reject transfer with insufficient balance (ERC20)", async function () {
        await expect(
          proposalVoting.connect(addr1).transfer(addr2.address, tokens(2000))
        ).to.be.revertedWithCustomError(proposalVoting, "ERC20InsufficientBalance");
      });

      it("Should reject transfer to zero address (ERC20)", async function () {
        await expect(
          proposalVoting.connect(addr1).transfer(ethers.ZeroAddress, tokens(100))
        ).to.be.revertedWithCustomError(proposalVoting, "ERC20InvalidReceiver");
      });
    });

    describe("Burning Tokens", function () {
      beforeEach(async function () {
        await proposalVoting.mint(addr1.address, tokens(1000));
      });

      it("Should allow burning own tokens", async function () {
        await proposalVoting.connect(addr1).burn(tokens(300));
        expect(await proposalVoting.balanceOf(addr1.address)).to.equal(tokens(700));
        expect(await proposalVoting.totalSupply()).to.equal(tokens(10700));
      });

      it("Should reject burning more than balance", async function () {
        await expect(
          proposalVoting.connect(addr1).burn(tokens(2000))
        ).to.be.revertedWithCustomError(proposalVoting, "ERC20InsufficientBalance");
      });
    });

    describe("ERC20 Approvals & TransferFrom", function () {
      beforeEach(async function () {
        await proposalVoting.mint(addr1.address, tokens(1000));
      });

      it("Should approve and transferFrom (ERC20)", async function () {
        await proposalVoting.connect(addr1).approve(addr2.address, tokens(500));
        expect(await proposalVoting.allowance(addr1.address, addr2.address)).to.equal(tokens(500));

        await proposalVoting.connect(addr2).transferFrom(addr1.address, addr3.address, tokens(300));
        expect(await proposalVoting.balanceOf(addr3.address)).to.equal(tokens(300));
        expect(await proposalVoting.balanceOf(addr1.address)).to.equal(tokens(700));
        expect(await proposalVoting.allowance(addr1.address, addr2.address)).to.equal(tokens(200));
      });

      it("Should reject transferFrom without approval (ERC20)", async function () {
        await expect(
          proposalVoting.connect(addr2).transferFrom(addr1.address, addr3.address, tokens(300))
        ).to.be.revertedWithCustomError(proposalVoting, "ERC20InsufficientAllowance");
      });
    });
  });

  describe("Proposal Creation", function () {
    beforeEach(async function () {
      await proposalVoting.mint(addr1.address, tokens(500));
    });

    it("Should create a proposal successfully", async function () {
      const description = "Should we implement feature X?";
      const votingPeriod = 7 * 24 * 60 * 60;

      await proposalVoting.connect(addr1).createProposal(description, votingPeriod);

      expect(await proposalVoting.proposalCount()).to.equal(1);
      
      const proposal = await proposalVoting.getProposal(1);
      expect(proposal.description).to.equal(description);
      expect(proposal.proposer).to.equal(addr1.address);
      expect(proposal.yesVotes).to.equal(0);
      expect(proposal.noVotes).to.equal(0);
      expect(proposal.executed).to.equal(false);
      expect(proposal.status).to.equal(0);
    });

    it("Should emit ProposalCreated event", async function () {
      const description = "Should we implement feature X?";
      const votingPeriod = 7 * 24 * 60 * 60;

      await expect(proposalVoting.connect(addr1).createProposal(description, votingPeriod))
        .to.emit(proposalVoting, "ProposalCreated");
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
    const votingPeriod = 3600;

    beforeEach(async function () {
      await proposalVoting.mint(addr1.address, tokens(500));
      await proposalVoting.mint(addr2.address, tokens(300));
      await proposalVoting.mint(addr3.address, tokens(200));

      await proposalVoting.connect(addr1).createProposal("Test Proposal", votingPeriod);
      proposalId = 1;
    });

    it("Should allow voting with tokens", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      
      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(tokens(500));
      expect(proposal.noVotes).to.equal(0);
    });

    it("Should record yes votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, true);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(tokens(800));
    });

    it("Should record no votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, false);
      await proposalVoting.connect(addr2).vote(proposalId, false);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.noVotes).to.equal(tokens(800));
    });

    it("Should record mixed votes correctly", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, false);
      await proposalVoting.connect(addr3).vote(proposalId, true);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.yesVotes).to.equal(tokens(700));
      expect(proposal.noVotes).to.equal(tokens(300));
    });

    it("Should emit VoteCast event", async function () {
      await expect(proposalVoting.connect(addr1).vote(proposalId, true))
        .to.emit(proposalVoting, "VoteCast")
        .withArgs(proposalId, addr1.address, true, tokens(500));
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
    const votingPeriod = 3600;

    beforeEach(async function () {
      await proposalVoting.mint(addr1.address, tokens(600));
      await proposalVoting.mint(addr2.address, tokens(400));

      await proposalVoting.connect(addr1).createProposal("Test Proposal", votingPeriod);
      proposalId = 1;
    });

    it("Should execute proposal that passes threshold", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, false);

      await time.increase(votingPeriod + 1);

      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.executed).to.equal(true);
      expect(proposal.status).to.equal(3);
    });

    it("Should fail proposal that doesn't meet threshold", async function () {
      await proposalVoting.connect(addr1).vote(proposalId, false);
      await proposalVoting.connect(addr2).vote(proposalId, true);

      await time.increase(votingPeriod + 1);

      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.executed).to.equal(true);
      expect(proposal.status).to.equal(2);
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
      await proposalVoting.mint(addr3.address, tokens(1000));
      await proposalVoting.connect(addr1).vote(proposalId, true);
      await proposalVoting.connect(addr2).vote(proposalId, true);
      await proposalVoting.connect(addr3).vote(proposalId, false);

      await time.increase(votingPeriod + 1);
      await proposalVoting.executeProposal(proposalId);

      const proposal = await proposalVoting.getProposal(proposalId);
      expect(proposal.status).to.equal(3);
    });
  });

  describe("View Functions", function () {
    it("Should return correct voting power", async function () {
      await proposalVoting.mint(addr1.address, tokens(750));
      expect(await proposalVoting.getVotingPower(addr1.address)).to.equal(tokens(750));
    });

    it("Should return correct vote counts", async function () {
      await proposalVoting.mint(addr1.address, tokens(500));
      await proposalVoting.mint(addr2.address, tokens(300));
      
      await proposalVoting.connect(addr1).createProposal("Test", 3600);
      await proposalVoting.connect(addr1).vote(1, true);
      await proposalVoting.connect(addr2).vote(1, false);

      const [yesVotes, noVotes, totalVotes] = await proposalVoting.getVoteCounts(1);
      expect(yesVotes).to.equal(tokens(500));
      expect(noVotes).to.equal(tokens(300));
      expect(totalVotes).to.equal(tokens(800));
    });

    it("Should check if voting is active", async function () {
      await proposalVoting.mint(addr1.address, tokens(500));
      await proposalVoting.connect(addr1).createProposal("Test", 3600);

      expect(await proposalVoting.isVotingActive(1)).to.equal(true);

      await time.increase(3601);
      expect(await proposalVoting.isVotingActive(1)).to.equal(false);
    });

    it("Should return total supply (ERC20)", async function () {
      expect(await proposalVoting.getTotalSupply()).to.equal(tokens(10000));
      
      await proposalVoting.mint(addr1.address, tokens(500));
      expect(await proposalVoting.getTotalSupply()).to.equal(tokens(10500));
    });
  });
});
const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting Voting Proposal Demo...\n");

  // Get signers (test accounts)
  const [owner, voter1, voter2, voter3] = await hre.ethers.getSigners();
  
  console.log("📋 Accounts:");
  console.log("Owner:", owner.address);
  console.log("Voter 1:", voter1.address);
  console.log("Voter 2:", voter2.address);
  console.log("Voter 3:", voter3.address);
  console.log("\n" + "=".repeat(60) + "\n");

  // 1. Deploy Contract
  console.log("📦 Deploying ProposalVoting contract...");
  const ProposalVoting = await hre.ethers.getContractFactory("ProposalVoting");
  const contract = await ProposalVoting.deploy();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("✅ Contract deployed to:", contractAddress);
  console.log("\n" + "=".repeat(60) + "\n");

  // 2. Check initial balance
  const ownerBalance = await contract.balanceOf(owner.address);
  console.log("💰 Initial Token Balances:");
  console.log("Owner:", hre.ethers.formatEther(ownerBalance), "GOV tokens");
  console.log("\n" + "=".repeat(60) + "\n");

  // 3. Distribute tokens to voters
  console.log("🎁 Distributing tokens to voters...");
  await contract.transfer(voter1.address, hre.ethers.parseEther("1000"));
  await contract.transfer(voter2.address, hre.ethers.parseEther("500"));
  await contract.transfer(voter3.address, hre.ethers.parseEther("200"));
  console.log("✅ Tokens distributed!");
  
  const v1Balance = await contract.balanceOf(voter1.address);
  const v2Balance = await contract.balanceOf(voter2.address);
  const v3Balance = await contract.balanceOf(voter3.address);
  console.log("Voter 1:", hre.ethers.formatEther(v1Balance), "GOV");
  console.log("Voter 2:", hre.ethers.formatEther(v2Balance), "GOV");
  console.log("Voter 3:", hre.ethers.formatEther(v3Balance), "GOV");
  console.log("\n" + "=".repeat(60) + "\n");

  // 4. Create a proposal
  console.log("📝 Creating proposal...");
  const description = "Should we upgrade the protocol to v2.0?";
  const votingPeriod = 300; // 5 minutes
  
  const createTx = await contract.createProposal(description, votingPeriod);
  await createTx.wait();
  console.log("✅ Proposal created!");
  console.log("Description:", description);
  console.log("Voting Period:", votingPeriod, "seconds");
  
  const proposal = await contract.getProposal(1);
  console.log("\n📊 Proposal Details:");
  console.log("ID:", proposal.id.toString());
  console.log("Proposer:", proposal.proposer);
  console.log("Status:", ["Active", "Passed", "Failed", "Executed"][proposal.status]);
  console.log("Deadline:", new Date(Number(proposal.deadline) * 1000).toLocaleString());
  console.log("\n" + "=".repeat(60) + "\n");

  // 5. Cast votes
  console.log("🗳️  Casting votes...\n");
  
  // Owner votes YES
  console.log("Owner voting YES...");
  const vote1 = await contract.vote(1, true);
  await vote1.wait();
  console.log("✅ Owner voted YES");
  
  // Voter1 votes YES
  console.log("Voter 1 voting YES...");
  const vote2 = await contract.connect(voter1).vote(1, true);
  await vote2.wait();
  console.log("✅ Voter 1 voted YES");
  
  // Voter2 votes NO
  console.log("Voter 2 voting NO...");
  const vote3 = await contract.connect(voter2).vote(1, false);
  await vote3.wait();
  console.log("✅ Voter 2 voted NO");
  
  // Voter3 votes YES
  console.log("Voter 3 voting YES...");
  const vote4 = await contract.connect(voter3).vote(1, true);
  await vote4.wait();
  console.log("✅ Voter 3 voted YES");
  
  console.log("\n" + "=".repeat(60) + "\n");

  // 6. Check vote results
  console.log("📈 Current Vote Results:");
  const [yesVotes, noVotes, totalVotes] = await contract.getVoteCounts(1);
  console.log("YES votes:", hre.ethers.formatEther(yesVotes), "GOV");
  console.log("NO votes:", hre.ethers.formatEther(noVotes), "GOV");
  console.log("Total votes:", hre.ethers.formatEther(totalVotes), "GOV");
  
  const yesPercentage = (Number(yesVotes) * 100) / Number(totalVotes);
  console.log("YES percentage:", yesPercentage.toFixed(2) + "%");
  console.log("\n" + "=".repeat(60) + "\n");

  // 7. Wait for voting period to end (simulate time passing)
  console.log("⏰ Fast-forwarding time past deadline...");
  await hre.network.provider.send("evm_increaseTime", [votingPeriod + 1]);
  await hre.network.provider.send("evm_mine");
  console.log("✅ Time advanced");
  console.log("\n" + "=".repeat(60) + "\n");

  // 8. Execute proposal
  console.log("⚡ Executing proposal...");
  const executeTx = await contract.executeProposal(1);
  await executeTx.wait();
  console.log("✅ Proposal executed!");
  
  const finalProposal = await contract.getProposal(1);
  const status = ["Active", "Passed", "Failed", "Executed"][finalProposal.status];
  console.log("\n🎯 Final Result:", status);
  console.log("Proposal", finalProposal.status === 3n ? "PASSED ✅" : "FAILED ❌");
  
  console.log("\n" + "=".repeat(60) + "\n");
  console.log("🎉 Demo completed successfully!");
  console.log("\nContract Address:", contractAddress);
  console.log("Save this address to interact with the contract later!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
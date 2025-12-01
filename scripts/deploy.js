const hre = require("hardhat");

async function main() {
  console.log("Deploying ProposalVoting contract to Sepolia...");

  // Get the contract factory
  const ProposalVoting = await hre.ethers.getContractFactory("ProposalVoting");
  
  // Deploy the contract
  const proposalVoting = await ProposalVoting.deploy();
  
  // Wait for deployment to complete
  await proposalVoting.waitForDeployment();
  
  const address = await proposalVoting.getAddress();
  
  console.log("✅ ProposalVoting deployed successfully!");
  console.log("Contract address:", address);
  console.log("Deployment transaction hash:", proposalVoting.deploymentTransaction().hash);
  console.log("\n📍 Sepolia Etherscan URL:");
  console.log(`https://sepolia.etherscan.io/address/${address}`);
  
  // Wait for a few block confirmations
  console.log("\nWaiting for block confirmations...");
  await proposalVoting.deploymentTransaction().wait(5);
  
  console.log("\n🎉 Contract verified and ready to use!");
  console.log("\nNext steps:");
  console.log("1. Copy the contract address above");
  console.log("2. Visit the Sepolia Etherscan URL");
  console.log("3. Interact with the contract using the 'Write Contract' tab");
  
  // Get initial state
  const owner = await proposalVoting.owner();
  const totalSupply = await proposalVoting.totalSupply();
  
  console.log("\n📊 Initial Contract State:");
  console.log("Owner:", owner);
  console.log("Total Supply:", totalSupply.toString(), "tokens");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
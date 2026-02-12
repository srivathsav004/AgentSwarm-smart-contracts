import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  console.log("\n🚀 Deploying AgentToken on SKALE");
  console.log("────────────────────────────────");

  const rpcUrl = process.env.SKALE_RPC_URL;
  const privateKey = process.env.SKALE_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing SKALE_RPC_URL or SKALE_PRIVATE_KEY");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("👤 Deployer :", wallet.address);
  console.log(
    "💰 Balance  :",
    ethers.formatEther(await provider.getBalance(wallet.address))
  );

  console.log("\n📦 Loading contract artifact...");
  const artifact = await hre.artifacts.readArtifact("AgentToken");
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("⏳ Deploying contract...");
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();

  console.log("🧾 Tx Hash  :", deployTx?.hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ Contract Address :", address);
  console.log("🎉 Deployment complete\n");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed");
  console.error(error);
  process.exitCode = 1;
});

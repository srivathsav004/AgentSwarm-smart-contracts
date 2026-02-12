import hre from 'hardhat';
import { ethers } from 'ethers';
import fs from 'fs';

async function main() {
    console.log('\n🚀 Deploying AgentRegistry on SKALE');
    console.log('────────────────────────────────');

    const rpcUrl = process.env.SKALE_RPC_URL;
    const privateKey = process.env.SKALE_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        throw new Error('Missing SKALE_RPC_URL or SKALE_PRIVATE_KEY');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log('👤 Deployer :', wallet.address);
    console.log(
        '💰 Balance  :',
        ethers.formatEther(await provider.getBalance(wallet.address))
    );

    // Deploy AgentRegistry
    console.log('\n📋 Deploying AgentRegistry...');
    const artifact = await hre.artifacts.readArtifact('AgentRegistry');
    const factory = new ethers.ContractFactory(
        artifact.abi,
        artifact.bytecode,
        wallet
    );
    
    const agentRegistry = await factory.deploy();
    const deployTx = agentRegistry.deploymentTransaction();

    console.log('🧾 Tx Hash  :', deployTx?.hash);
    await agentRegistry.waitForDeployment();
    
    const registryAddress = await agentRegistry.getAddress();
    console.log(`✅ AgentRegistry deployed to: ${registryAddress}`);
    
    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    const owner = await agentRegistry.owner();
    const nextAgentId = await agentRegistry.nextAgentId();
    
    console.log(`Contract owner: ${owner}`);
    console.log(`Next agent ID: ${nextAgentId.toString()}`);
    console.log(`Owner matches deployer: ${owner === wallet.address ? '✅' : '❌'}`);

    // Save deployment info
    const deploymentInfo = {
        network: (await provider.getNetwork()).name,
        deployer: wallet.address,
        agentRegistryAddress: registryAddress,
        deployedAt: new Date().toISOString(),
        blockNumber: await provider.getBlockNumber()
    };

    fs.writeFileSync('./deployment.json', JSON.stringify(deploymentInfo, null, 2));

    console.log('\n🎉 Deployment complete!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
import hre from 'hardhat';
import { ethers } from 'ethers';

async function main() {
    console.log('\n🚀 Deploying TaskEscrow Contract');
    console.log('─────────────────────────────────────');

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

    // Auto-updated after latest deployment
    const AGENT_REGISTRY = "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1";
    const AGENT_TOKEN = "0xEC307d7ae333C32b70889F0Fd61ce6f02Ee31Cf8";

    console.log(`🤖 AgentRegistry: ${AGENT_REGISTRY}`);
    console.log(`🪙 AgentToken: ${AGENT_TOKEN}`);

    // Verify contracts exist
    console.log('\n🔍 Verifying existing contracts...');
    
    try {
        const registryCode = await provider.getCode(AGENT_REGISTRY);
        const tokenCode = await provider.getCode(AGENT_TOKEN);
        
        if (registryCode === '0x') {
            throw new Error('AgentRegistry contract not found');
        }
        if (tokenCode === '0x') {
            throw new Error('AgentToken contract not found');
        }
        
        console.log('✅ Both contracts verified');
    } catch (error) {
        console.error('❌ Contract verification failed:', error.message);
        process.exit(1);
    }

    // Deploy TaskEscrow
    console.log('\n📝 Deploying TaskEscrow...');
    
    try {
        const artifact = await hre.artifacts.readArtifact('TaskEscrow');
        const TaskEscrow = new ethers.ContractFactory(
            artifact.abi,
            artifact.bytecode,
            wallet
        );
        
        const escrow = await TaskEscrow.deploy(AGENT_TOKEN, AGENT_REGISTRY);
        
        console.log(`Transaction hash: ${escrow.deploymentTransaction().hash}`);
        console.log('⏳ Waiting for deployment...');
        
        await escrow.waitForDeployment();
        
        const escrowAddress = await escrow.getAddress();
        console.log(`✅ TaskEscrow deployed at: ${escrowAddress}`);

        // Authorize escrow in registry so it can update reputation
        console.log('\n🔐 Authorizing escrow in AgentRegistry...');
        try {
            const registryArtifact = await hre.artifacts.readArtifact('AgentRegistry');
            const registry = new ethers.Contract(AGENT_REGISTRY, registryArtifact.abi, wallet);
            const authTx = await registry.setAuthorizedCaller(escrowAddress, true);
            console.log(`📝 setAuthorizedCaller TX: ${authTx.hash}`);
            await authTx.wait();
            console.log('✅ Escrow authorized in registry');
        } catch (e) {
            console.log('⚠️  Could not authorize escrow in registry (is registry upgraded?)');
            console.log(`   Error: ${e.message}`);
        }

        // Verify deployment
        const owner = await escrow.owner();
        const tokenAddress = await escrow.agentToken();
        const registryAddress = await escrow.registry();
        
        console.log('\n📋 Deployment Verification:');
        console.log(`Contract Address: ${escrowAddress}`);
        console.log(`Owner: ${owner}`);
        console.log(`Token: ${tokenAddress}`);
        console.log(`Registry: ${registryAddress}`);
        
        if (owner !== wallet.address) {
            console.log('⚠️  Warning: You are not the owner');
        }
        if (tokenAddress !== AGENT_TOKEN) {
            console.log('⚠️  Warning: Token address mismatch');
        }
        if (registryAddress !== AGENT_REGISTRY) {
            console.log('⚠️  Warning: Registry address mismatch');
        }

        console.log('\n🎯 Next Steps:');
        console.log(`1. Update your demo script with: ${escrowAddress}`);
        console.log('2. Run the x402 payments demo');
        console.log('3. Test real token transfers');

    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        if (error.data) {
            console.error('Error data:', error.data);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
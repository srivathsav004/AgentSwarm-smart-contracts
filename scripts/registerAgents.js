import hre from 'hardhat';
import { ethers } from 'ethers';

async function main() {
    console.log('\n🚀 Registering Agents with Pricing');
    console.log('─────────────────────────────────────────');

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

    // Agent data with pricing (in wei - adjust as needed)
    const AGENTS = [
        {
            address: "0xf3A97D7c0c8B6B5fa13B2aaf2634fAb1ed4E7523",
            type: 0, // Coordinator
            price: ethers.parseEther("5") // 50 tokens per task
        },
        {
            address: "0xd72076D2e95444Da973008d7259BB9335c5791cE",
            type: 1, // Research
            price: ethers.parseEther("7") // 70 tokens per task
        },
        {
            address: "0x9307506E9BA4dc86eb6C04bDDE830a1eeFc622EA",
            type: 2, // Analyst
            price: ethers.parseEther("8") // 80 tokens per task
        },
        {
            address: "0x7835Cc9Ced1424776582E946d02c5597Dc4195f3",
            type: 3, // Content
            price: ethers.parseEther("7") // 75 tokens per task
        },
        {
            address: "0x1C26f4df59C84566918B51f000613b5277D4B7B2",
            type: 4, // Code
            price: ethers.parseEther("9") // 90 tokens per task
        }
    ];

    // Auto-updated after latest deployment
    const REGISTRY_ADDRESS = "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1";

    // Connect to deployed contract
    const artifact = await hre.artifacts.readArtifact('AgentRegistry');
    const registry = new ethers.Contract(REGISTRY_ADDRESS, artifact.abi, wallet);

    // Verify we can access the contract
    try {
        const owner = await registry.owner();
        console.log(`Contract owner: ${owner}`);
        
        if (owner !== wallet.address) {
            console.error('❌ You are not the owner of this contract');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Cannot connect to registry contract:', error.message);
        process.exit(1);
    }

    console.log('\n📝 Registering agents with pricing...\n');
    
    const registeredAgents = [];
    
    for (let i = 0; i < AGENTS.length; i++) {
        const agent = AGENTS[i];
        
        try {
            console.log(`[${i + 1}/${AGENTS.length}] Registering Agent`);
            console.log(`  Type: ${['Coordinator', 'Research', 'Analyst', 'Content', 'Code'][agent.type]}`);
            console.log(`  Address: ${agent.address}`);
            console.log(`  Price: ${ethers.formatEther(agent.price)} tokens per task`);

            // Estimate gas first
            let gasEstimate;
            try {
                gasEstimate = await registry.registerAgent.estimateGas(
                    agent.address,
                    agent.type,
                    agent.price
                );
                console.log(`  Estimated gas: ${gasEstimate.toString()}`);
            } catch (gasError) {
                console.error(`  ❌ Gas estimation failed: ${gasError.message}`);
                continue;
            }

            // Send transaction
            const tx = await registry.registerAgent(
                agent.address,
                agent.type,
                agent.price,
                {
                    gasLimit: gasEstimate * 120n / 100n, // Add 20% buffer
                    gasPrice: ethers.parseUnits('0.0002', 'gwei')
                }
            );

            console.log(`  Transaction: ${tx.hash}`);
            
            const receipt = await tx.wait();
            
            // Extract agent ID from event
            let agentId = 'Unknown';
            for (const log of receipt.logs) {
                try {
                    const parsed = registry.interface.parseLog(log);
                    if (parsed.name === 'AgentRegistered') {
                        agentId = parsed.args[0].toString();
                        break;
                    }
                } catch {
                    // Skip unparseable logs
                }
            }
            
            console.log(`  ✅ Registered as Agent ID: ${agentId}`);
            console.log(`  Gas used: ${receipt.gasUsed.toString()}\n`);

            registeredAgents.push({
                agentId: agentId,
                ...agent
            });

            // Small delay to avoid nonce issues
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`❌ Failed to register agent:`);
            console.error(`   Error: ${error.message}\n`);
        }
    }

    // Verification phase
    console.log('🔍 Verifying registrations...\n');
    
    for (const agent of registeredAgents) {
        try {
            const [agentId, agentData] = await registry.getAgentByWallet(agent.address);
            
            if (agentId.toString() === '0') {
                console.log(`❌ Agent not found in registry`);
                continue;
            }

            console.log(`✅ Agent ${agentId.toString()}`);
            console.log(`   Type: ${['Coordinator', 'Research', 'Analyst', 'Content', 'Code'][agentData.agentType]}`);
            console.log(`   Wallet: ${agentData.walletAddress}`);
            console.log(`   Price: ${ethers.formatEther(agentData.pricePerTask)} tokens`);
            console.log(`   Reputation: ${agentData.reputation.toString()}/1000`);
            console.log(`   Active: ${agentData.active}`);
            console.log('');
            
        } catch (error) {
            console.error(`❌ Failed to verify agent:`, error.message);
        }
    }

    console.log('\n🎉 Agent registration complete!');
    console.log(`✅ Successfully registered ${registeredAgents.length}/${AGENTS.length} agents`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
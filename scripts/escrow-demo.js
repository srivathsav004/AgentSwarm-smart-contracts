import hre from 'hardhat';
import { ethers } from 'ethers';

async function main() {
    console.log('\n🎯 Complete x402 Budget-Based Payment Demo');
    console.log('═══════════════════════════════════════════════');

    const rpcUrl = process.env.SKALE_RPC_URL;
    const privateKey = process.env.SKALE_PRIVATE_KEY; // Server wallet (handles all x402 payments)
    const testUserPrivateKey = process.env.TEST_USER_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        throw new Error('Missing SKALE_RPC_URL or SKALE_PRIVATE_KEY');
    }
    
    if (!testUserPrivateKey) {
        throw new Error('Missing TEST_USER_PRIVATE_KEY');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const serverWallet = new ethers.Wallet(privateKey, provider); // Server handles x402 payments
    
    // Create a test user wallet (in prod, user signs on client-side)
    const userWallet = new ethers.Wallet(testUserPrivateKey, provider);
    
    // Optional: verify the wallet address matches expected (set EXPECTED_TEST_USER_ADDRESS if you want this)
    const expectedUserAddress = process.env.EXPECTED_TEST_USER_ADDRESS;
    if (expectedUserAddress && userWallet.address.toLowerCase() !== expectedUserAddress.toLowerCase()) {
        throw new Error(`User wallet address ${userWallet.address} does not match expected ${expectedUserAddress}`);
    }

    console.log(`🖥️  Server Wallet: ${serverWallet.address}`);
    console.log(`👤 User Wallet: ${userWallet.address}`);

    // Auto-updated after latest deployment
    const AGENT_REGISTRY = "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1";
    const AGENT_TOKEN = "0xEC307d7ae333C32b70889F0Fd61ce6f02Ee31Cf8";
    const TASK_ESCROW = "0x7448471429d6b31A25809deffB1C6e4Ea209C4F6";

    const registryArtifact = await hre.artifacts.readArtifact('AgentRegistry');
    const tokenArtifact = await hre.artifacts.readArtifact('AgentToken');
    const escrowArtifact = await hre.artifacts.readArtifact('TaskEscrow');

    const registry = new ethers.Contract(AGENT_REGISTRY, registryArtifact.abi, provider);
    const token = new ethers.Contract(AGENT_TOKEN, tokenArtifact.abi, provider);
    const escrow = new ethers.Contract(TASK_ESCROW, escrowArtifact.abi, provider);

    // DEBUG: Check ABI and wiring
    console.log('\n🔍 DEBUG: Checking TaskEscrow ABI');
    const allocateFunc = escrowArtifact.abi.find(f => f.name === 'allocateBudgetToAgent');
    const getTaskFunc = escrowArtifact.abi.find(f => f.name === 'getTask');
    const tasksFunc = escrowArtifact.abi.find(f => f.name === 'tasks');
    console.log(`   allocateBudgetToAgent: ${allocateFunc ? 'Found' : 'NOT FOUND'}`);
    console.log(`   getTask: ${getTaskFunc ? 'Found' : 'NOT FOUND'}`);
    console.log(`   tasks: ${tasksFunc ? 'Found' : 'NOT FOUND'}`);
    if (allocateFunc) {
        console.log(`   allocateBudgetToAgent inputs:`, allocateFunc.inputs.map(i => i.name));
    }
    const onChainRegistry = await escrow.registry();
    console.log(`   Escrow.registry(): ${onChainRegistry}`);
    console.log(`   AGENT_REGISTRY  : ${AGENT_REGISTRY}`);

    // Check server is owner
    const owner = await escrow.owner();
    console.log(`🔐 Escrow Owner: ${owner}`);
    if (owner.toLowerCase() !== serverWallet.address.toLowerCase()) {
        console.log(`⚠️  WARNING: Server wallet is NOT the escrow owner!`);
        console.log(`   Server: ${serverWallet.address}`);
        console.log(`   Owner:  ${owner}`);
        return;
    }

    // Ensure escrow is authorized to update reputation in AgentRegistry (newer AgentRegistry version)
    console.log('\n🔐 Ensuring escrow is authorized in AgentRegistry...');
    try {
        const serverRegistry = registry.connect(serverWallet);
        const isAuthorized = await registry.authorizedCallers(TASK_ESCROW);
        console.log(`   authorizedCallers(escrow) = ${isAuthorized}`);
        if (!isAuthorized) {
            const authTx = await serverRegistry.setAuthorizedCaller(TASK_ESCROW, true);
            console.log(`📝 setAuthorizedCaller TX: ${authTx.hash}`);
            await authTx.wait();
            console.log('✅ Escrow authorized');
        }
    } catch (e) {
        console.log('⚠️  Could not check/authorize escrow in registry (is AgentRegistry upgraded?)');
        console.log(`   Error: ${e.message}`);
    }

    // Fund user wallet for demo
    console.log('\n💰 Setting up demo wallets...');
    const serverTokenContract = token.connect(serverWallet);
    
    const userBalance = await token.balanceOf(userWallet.address);
    if (userBalance < ethers.parseEther("500")) {
        console.log('🎁 Funding user wallet...');
        const fundTx = await serverTokenContract.transfer(userWallet.address, ethers.parseEther("500"));
        await fundTx.wait();
        console.log('✅ User wallet funded with 500 tokens');
    }

    // Get available agents with full details
    console.log('\n🤖 Available Agents (by Type):');
    const agentTypes = ['Coordinator', 'Research', 'Analyst', 'Content', 'Code'];
    const allAgents = await registry.getAllActiveAgents();
    
    const bestAgents = {};
    const typeAgents = {}; // Store all agents by type
    
    for (let typeId = 0; typeId < agentTypes.length; typeId++) {
        typeAgents[typeId] = [];
        
        // Find all agents of this type
        for (const agentId of allAgents) {
            const agent = await registry.getAgent(agentId);
            // Convert agentType from bigint to number for comparison
            const agentTypeNum = Number(agent.agentType);
            if (agentTypeNum === typeId && agent.active) {
                typeAgents[typeId].push({
                    id: Number(agentId),
                    price: agent.pricePerTask,
                    wallet: agent.walletAddress,
                    reputation: Number(agent.reputation),
                    type: agentTypes[typeId]
                });
            }
        }
        
        // Sort by reputation (descending)
        typeAgents[typeId].sort((a, b) => b.reputation - a.reputation);
        
        // Select best agent (highest reputation)
        if (typeAgents[typeId].length > 0) {
            bestAgents[typeId] = typeAgents[typeId][0];
            console.log(`\n🏆 ${agentTypes[typeId]} Agents (${typeAgents[typeId].length} found):`);
            typeAgents[typeId].forEach((agent, idx) => {
                const marker = idx === 0 ? '🥇 Selected:' : `   Option ${idx + 1}:`;
                console.log(`   ${marker} Agent ${agent.id} - ${ethers.formatEther(agent.price)} tokens (rep: ${agent.reputation})`);
            });
        } else {
            console.log(`\n❌ No ${agentTypes[typeId]} agents available`);
        }
    }

    if (!bestAgents[0]) {
        console.log('❌ No coordinator agent available - cannot proceed');
        return;
    }

    // Calculate total budget for all agents
    const coordinatorFee = bestAgents[0].price;
    const researchFee = bestAgents[1]?.price || 0n;
    const analystFee = bestAgents[2]?.price || 0n;
    const contentFee = bestAgents[3]?.price || 0n;
    const codeFee = bestAgents[4]?.price || 0n;
    
    // Sum all fees + small buffer for gas
    const totalFees = coordinatorFee + researchFee + analystFee + contentFee + codeFee;
    const totalBudget = totalFees;

    console.log('\n💼 Budget Planning:');
    console.log(`┌─────────────────────────────────────────┐`);
    console.log(`│  Coordinator Fee: ${ethers.formatEther(coordinatorFee).padEnd(8)} tokens  │`);
    if (researchFee > 0) console.log(`│  Research Fee:    ${ethers.formatEther(researchFee).padEnd(8)} tokens  │`);
    if (analystFee > 0) console.log(`│  Analyst Fee:     ${ethers.formatEther(analystFee).padEnd(8)} tokens  │`);
    if (contentFee > 0) console.log(`│  Content Fee:     ${ethers.formatEther(contentFee).padEnd(8)} tokens  │`);
    if (codeFee > 0) console.log(`│  Code Fee:        ${ethers.formatEther(codeFee).padEnd(8)} tokens  │`);
    console.log(`├─────────────────────────────────────────┤`);
    console.log(`│  Total Budget:    ${ethers.formatEther(totalBudget).padEnd(8)} tokens  │`);
    console.log(`└─────────────────────────────────────────┘`);

    // STEP 1: User creates task with total budget
    console.log('\n📋 STEP 1: User creates task with total budget');
    console.log('─────────────────────────────────────────────');

    const userTokenContract = token.connect(userWallet);
    const userEscrowContract = escrow.connect(userWallet);
    const serverEscrowContract = escrow.connect(serverWallet);
    const simulateFailure = (process.env.SIMULATE_AGENT_FAILURE || '').toLowerCase() === 'true';
    const failPhase = (process.env.FAIL_PHASE || 'Analysis').toLowerCase(); // Research | Analysis | Content | Code

    let taskId;
    try {
        // User approves total budget
        console.log('🔐 User approving total budget...');
        const approveTx = await userTokenContract.approve(TASK_ESCROW, totalBudget);
        console.log(`📝 Approve TX: ${approveTx.hash}`);
        await approveTx.wait();
        console.log('✅ Budget approved');

        // User creates task
        console.log('🚀 User creating task with budget...');
        const createTaskTx = await userEscrowContract.createTaskWithBudget(
            bestAgents[0].id,
            totalBudget,
            "ipfs://ComplexMultiAgentWorkflow"
        );
        console.log(`📝 Create Task TX: ${createTaskTx.hash}`);
        const receipt = await createTaskTx.wait();
        console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

        // Extract task ID
        for (const log of receipt.logs) {
            try {
                const parsed = escrow.interface.parseLog(log);
                if (parsed && parsed.name === 'TaskCreated') {
                    taskId = parsed.args[0].toString();
                    break;
                }
            } catch {}
        }

        if (!taskId) {
            throw new Error('Failed to extract task ID from transaction');
        }

        console.log(`✅ Task created with ID: ${taskId}`);
        console.log(`💰 ${ethers.formatEther(totalBudget)} tokens locked in escrow`);

    } catch (error) {
        console.error('❌ Failed at task creation:', error.message);
        return;
    }

    // Track all agent requests
    const agentRequests = [];

    // Debug: Check task budget before allocations (use simple view to avoid struct decode issues)
    console.log('\n🔍 DEBUG: Checking task budget before allocations');
    try {
        const [totalBudgetCheck, remainingBudgetCheck, coordinatorFeeCheck] =
            await escrow.getTaskBudgetInfo(BigInt(taskId));
        console.log(`   Total Budget: ${ethers.formatEther(totalBudgetCheck)} tokens`);
        console.log(`   Remaining Budget: ${ethers.formatEther(remainingBudgetCheck)} tokens`);
        console.log(`   Coordinator Fee: ${ethers.formatEther(coordinatorFeeCheck)} tokens`);
    } catch (e) {
        console.log(`   Error getting task budget: ${e.message}`);
    }

    // Allocate to Research agent (if available)
    if (bestAgents[1]) {
        console.log(`\n🔬 STEP: Allocate to Research Agent ${bestAgents[1].id}`);
        console.log('─────────────────────────────────────────────');
        
        try {
            const researchFee = bestAgents[1].price;
            console.log(`💸 Allocating ${ethers.formatEther(researchFee)} tokens...`);
            console.log(`   DEBUG: taskId=${taskId} (type: ${typeof taskId})`);
            console.log(`   DEBUG: agentId=${bestAgents[1].id} (type: ${typeof bestAgents[1].id})`);
            console.log(`   DEBUG: researchFee=${researchFee} (type: ${typeof researchFee})`);

            const allocateTx = await serverEscrowContract.allocateBudgetToAgent(
                BigInt(taskId),
                BigInt(bestAgents[1].id),
                researchFee
            );
            console.log(`📝 Allocate TX: ${allocateTx.hash}`);
            const allocateReceipt = await allocateTx.wait();
            
            // Extract request ID
            let requestId;
            for (const log of allocateReceipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog(log);
                    if (parsed && parsed.name === 'AgentRequestCreated') {
                        requestId = parsed.args[0].toString();
                        break;
                    }
                } catch {}
            }
            
            if (requestId) {
                agentRequests.push({ id: requestId, agent: bestAgents[1], phase: 'Research' });
                console.log(`✅ Research budget allocated - Request ID: ${requestId}`);
                
                // Complete research work
                console.log('🔬 Simulating research work...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const completeTx = await serverEscrowContract.completeAgentRequest(BigInt(requestId), true);
                console.log(`📝 Complete TX: ${completeTx.hash}`);
                await completeTx.wait();
                console.log('✅ Research agent paid!');
            }
        } catch (error) {
            console.error('❌ Research allocation failed:', error.message);
        }
    }

    // Allocate to Analyst agent (if available)
    if (bestAgents[2]) {
        console.log(`\n📊 STEP: Allocate to Analyst Agent ${bestAgents[2].id}`);
        console.log('─────────────────────────────────────────────');
        
        try {
            const analystFee = bestAgents[2].price;
            console.log(`💸 Allocating ${ethers.formatEther(analystFee)} tokens...`);
            
            const allocateTx = await serverEscrowContract.allocateBudgetToAgent(
                BigInt(taskId),
                BigInt(bestAgents[2].id),
                analystFee
            );
            const allocateReceipt = await allocateTx.wait();
            
            let requestId;
            for (const log of allocateReceipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog(log);
                    if (parsed && parsed.name === 'AgentRequestCreated') {
                        requestId = parsed.args[0].toString();
                        break;
                    }
                } catch {}
            }
            
            if (requestId) {
                agentRequests.push({ id: requestId, agent: bestAgents[2], phase: 'Analysis' });
                console.log(`✅ Analyst budget allocated - Request ID: ${requestId}`);
                
                console.log('📊 Simulating analysis work...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const shouldFail = simulateFailure && failPhase === 'analysis';
                const completeTx = await serverEscrowContract.completeAgentRequest(BigInt(requestId), !shouldFail);
                await completeTx.wait();
                if (shouldFail) {
                    console.log('❌ Analyst failed - escrow should refund unpaid funds and halt task');
                    // Task is now failed/refunded; stop the demo run here.
                    console.log('\n📊 FINAL SUMMARY (after failure/refund)');
                    const finalUserBalance = await token.balanceOf(userWallet.address);
                    const finalEscrowBalance = await token.balanceOf(TASK_ESCROW);
                    console.log(`💰 User: ${ethers.formatEther(finalUserBalance)} tokens`);
                    console.log(`💰 Escrow: ${ethers.formatEther(finalEscrowBalance)} tokens`);
                    return;
                }
                console.log('✅ Analyst agent paid!');
            }
        } catch (error) {
            console.error('❌ Analyst allocation failed:', error.message);
        }
    }

    // Allocate to Content agent (if available)
    if (bestAgents[3]) {
        console.log(`\n✍️  STEP: Allocate to Content Agent ${bestAgents[3].id}`);
        console.log('─────────────────────────────────────────────');
        
        try {
            const contentFee = bestAgents[3].price;
            console.log(`💸 Allocating ${ethers.formatEther(contentFee)} tokens...`);
            
            const allocateTx = await serverEscrowContract.allocateBudgetToAgent(
                BigInt(taskId),
                BigInt(bestAgents[3].id),
                contentFee
            );
            const allocateReceipt = await allocateTx.wait();
            
            let requestId;
            for (const log of allocateReceipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog(log);
                    if (parsed && parsed.name === 'AgentRequestCreated') {
                        requestId = parsed.args[0].toString();
                        break;
                    }
                } catch {}
            }
            
            if (requestId) {
                agentRequests.push({ id: requestId, agent: bestAgents[3], phase: 'Content' });
                console.log(`✅ Content budget allocated - Request ID: ${requestId}`);
                
                console.log('✍️  Simulating content work...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const shouldFail = simulateFailure && failPhase === 'content';
                const completeTx = await serverEscrowContract.completeAgentRequest(BigInt(requestId), !shouldFail);
                await completeTx.wait();
                if (shouldFail) {
                    console.log('❌ Content failed - escrow should refund unpaid funds and halt task');
                    console.log('\n📊 FINAL SUMMARY (after failure/refund)');
                    const finalUserBalance = await token.balanceOf(userWallet.address);
                    const finalEscrowBalance = await token.balanceOf(TASK_ESCROW);
                    console.log(`💰 User: ${ethers.formatEther(finalUserBalance)} tokens`);
                    console.log(`💰 Escrow: ${ethers.formatEther(finalEscrowBalance)} tokens`);
                    return;
                }
                console.log('✅ Content agent paid!');
            }
        } catch (error) {
            console.error('❌ Content allocation failed:', error.message);
        }
    }

    // Allocate to Code agent (if available)
    if (bestAgents[4]) {
        console.log(`\n💻 STEP: Allocate to Code Agent ${bestAgents[4].id}`);
        console.log('─────────────────────────────────────────────');
        
        try {
            const codeFee = bestAgents[4].price;
            console.log(`💸 Allocating ${ethers.formatEther(codeFee)} tokens...`);
            
            const allocateTx = await serverEscrowContract.allocateBudgetToAgent(
                BigInt(taskId),
                BigInt(bestAgents[4].id),
                codeFee
            );
            const allocateReceipt = await allocateTx.wait();
            
            let requestId;
            for (const log of allocateReceipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog(log);
                    if (parsed && parsed.name === 'AgentRequestCreated') {
                        requestId = parsed.args[0].toString();
                        break;
                    }
                } catch {}
            }
            
            if (requestId) {
                agentRequests.push({ id: requestId, agent: bestAgents[4], phase: 'Code' });
                console.log(`✅ Code budget allocated - Request ID: ${requestId}`);
                
                console.log('💻 Simulating code work...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const shouldFail = simulateFailure && failPhase === 'code';
                const completeTx = await serverEscrowContract.completeAgentRequest(BigInt(requestId), !shouldFail);
                await completeTx.wait();
                if (shouldFail) {
                    console.log('❌ Code failed - escrow should refund unpaid funds and halt task');
                    console.log('\n📊 FINAL SUMMARY (after failure/refund)');
                    const finalUserBalance = await token.balanceOf(userWallet.address);
                    const finalEscrowBalance = await token.balanceOf(TASK_ESCROW);
                    console.log(`💰 User: ${ethers.formatEther(finalUserBalance)} tokens`);
                    console.log(`💰 Escrow: ${ethers.formatEther(finalEscrowBalance)} tokens`);
                    return;
                }
                console.log('✅ Code agent paid!');
            }
        } catch (error) {
            console.error('❌ Code allocation failed:', error.message);
        }
    }

    // Final step: Complete main task and pay coordinator
    console.log('\n🏁 FINAL STEP: Complete task and pay coordinator');
    console.log('─────────────────────────────────────────────');
    
    try {
        // Check remaining budget before completion
        const [totalBudgetCheck, remainingBudget, coordinatorFeeCheck] = await escrow.getTaskBudgetInfo(BigInt(taskId));
        console.log(`💰 Remaining in escrow: ${ethers.formatEther(remainingBudget)} tokens`);
        console.log(`💰 Coordinator fee: ${ethers.formatEther(coordinatorFeeCheck)} tokens`);
        
        console.log('🏁 All work completed, finalizing task...');
        const completeMainTx = await serverEscrowContract.completeTask(BigInt(taskId), true);
        console.log(`📝 Complete Task TX: ${completeMainTx.hash}`);
        await completeMainTx.wait();
        console.log('✅ Main task completed - Coordinator paid and refunds issued!');
    } catch (error) {
        console.error('❌ Task completion failed:', error.message);
    }

    // Final summary
    console.log('\n📊 FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════');
    
    const finalUserBalance = await token.balanceOf(userWallet.address);
    const finalCoordinatorBalance = bestAgents[0] ? await token.balanceOf(bestAgents[0].wallet) : 0n;
    const finalEscrowBalance = await token.balanceOf(TASK_ESCROW);

    console.log(`💰 User: ${ethers.formatEther(finalUserBalance)} tokens`);
    console.log(`💰 Coordinator: ${ethers.formatEther(finalCoordinatorBalance)} tokens`);
    console.log(`💰 Escrow: ${ethers.formatEther(finalEscrowBalance)} tokens`);
    
    console.log('\n🤖 Agents who completed work:');
    for (const req of agentRequests) {
        const agentBalance = await token.balanceOf(req.agent.wallet);
        console.log(`   ✅ ${req.phase}: Agent ${req.agent.id} - ${ethers.formatEther(agentBalance)} tokens earned`);
    }
    
    // Check reputation updates
    if (bestAgents[0]) {
        const updatedCoordinator = await registry.getAgent(bestAgents[0].id);
        console.log(`\n⭐ Coordinator reputation: ${updatedCoordinator.reputation}/1000`);
    }

    console.log('\n🎉 Demo Complete!');
    console.log('═══════════════════════════════════════════════');
    console.log('✅ User paid total budget upfront');
    console.log(`✅ Server allocated to ${agentRequests.length} agents`);
    console.log('✅ All agents paid after work completion');
    console.log('✅ Coordinator paid last');
    console.log('✅ Unused budget refunded to user');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
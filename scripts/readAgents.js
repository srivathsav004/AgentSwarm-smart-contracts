import hre from "hardhat";
import { ethers } from "ethers";

const AGENT_TYPES = ["Coordinator", "Research", "Analyst", "Content", "Code"];

async function main() {
    console.log("\n📖 Reading AgentRegistry (On-Chain)");
    console.log("────────────────────────────────────");

    const rpcUrl = process.env.SKALE_RPC_URL;
    if (!rpcUrl) throw new Error("Missing SKALE_RPC_URL");

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 🔴 UPDATE THIS IF CONTRACT ADDRESS CHANGES
    const REGISTRY_ADDRESS = "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1";

    const artifact = await hre.artifacts.readArtifact("AgentRegistry");
    const registry = new ethers.Contract(
        REGISTRY_ADDRESS,
        artifact.abi,
        provider
    );

    // ─────────────────────────────────────────────
    // BASIC CONTRACT INFO
    // ─────────────────────────────────────────────
    const totalAgents = await registry.getAgentCount();
    console.log(`📦 Total registered agents: ${totalAgents.toString()}\n`);

    // ─────────────────────────────────────────────
    // READ ALL AGENTS
    // ─────────────────────────────────────────────
    console.log("🧑‍💼 Agents:");
    console.log("────────────────────────────────────");

    for (let i = 1; i <= totalAgents; i++) {
        const agent = await registry.getAgent(i);

        console.log(`Agent ID: ${i}`);
        console.log(`  Wallet     : ${agent.walletAddress}`);
        console.log(`  Price      : ${ethers.formatEther(agent.pricePerTask)} tokens`);
        console.log(`  Type       : ${AGENT_TYPES[agent.agentType]}`);
        console.log(`  Reputation : ${agent.reputation.toString()}/1000`);
        console.log(`  Active     : ${agent.active}`);
        console.log("");
    }

    // ─────────────────────────────────────────────
    // READ AGENTS BY TYPE
    // ─────────────────────────────────────────────
    console.log("📂 Agents by Type:");
    console.log("────────────────────────────────────");

    for (let type = 0; type < AGENT_TYPES.length; type++) {
        const ids = await registry.getAgentsByType(type);
        console.log(
            `${AGENT_TYPES[type]} → [${ids.map(id => id.toString()).join(", ")}]`
        );

        if (ids.length > 0) {
            try {
                const best = await registry.getBestAgentByType(type);
                console.log(`   ⭐ Best: Agent ${best.toString()}`);
            } catch {
                console.log(`   ⚠️ No active agents`);
            }
        }
    }

    // ─────────────────────────────────────────────
    // ACTIVE AGENTS
    // ─────────────────────────────────────────────
    console.log("\n✅ Active Agents:");
    console.log("────────────────────────────────────");

    const activeAgents = await registry.getAllActiveAgents();
    console.log(
        `Active agent IDs: [${activeAgents.map(id => id.toString()).join(", ")}]`
    );

    console.log("\n🎉 Registry read complete\n");
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });

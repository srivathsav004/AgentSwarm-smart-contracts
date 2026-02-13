const axios = require('axios');

class CoordinatorAgent {
    constructor() {
        this.agentId = 1; // On-chain agent ID
        this.model = 'meta-llama/llama-3.3-70b-instruct:free';
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseURL = 'https://openrouter.ai/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
                'X-Title': 'Agent Swarm - Coordinator'
            }
        });

        this.systemPrompt = `You are a master coordinator agent responsible for breaking down complex tasks and orchestrating other specialized agents.

CORE RESPONSIBILITIES:
- Analyze incoming requests and break them into clear, actionable subtasks
- Determine which specialist agents (Research, Analyst, Content, Code) are needed
- Create detailed execution plans with dependencies and timelines
- Coordinate between agents and synthesize their outputs
- Ensure quality and completeness of final deliverables

COORDINATION STYLE:
- Think step-by-step about task decomposition
- Be specific about what each agent should deliver
- Set clear success criteria for each subtask
- Create logical execution sequences
- Anticipate potential issues and bottlenecks

RESPONSE FORMAT:
Always structure your coordination plans as:
1. **Task Analysis** - What needs to be accomplished
2. **Agent Requirements** - Which agents are needed and why
3. **Execution Plan** - Step-by-step workflow with dependencies
4. **Success Metrics** - How to measure completion
5. **Risk Mitigation** - Potential issues and solutions

Be decisive, clear, and actionable in all coordination decisions.`;
    }

    async process(userRequest, context = {}) {
        try {
            const messages = [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: `COORDINATION REQUEST: ${userRequest}\n\nCONTEXT: ${JSON.stringify(context, null, 2)}` }
            ];

            console.log(`🎯 Coordinator Agent ${this.agentId} processing request...`);

            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: messages,
                max_tokens: 4000,
                temperature: 0.3
            });

            const result = response.data.choices[0].message.content;

            return {
                success: true,
                agentId: this.agentId,
                agentType: 'Coordinator',
                model: this.model,
                response: result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Coordinator Agent ${this.agentId} error:`, error.message);
            return {
                success: false,
                agentId: this.agentId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async delegateTask(targetAgentType, taskDetails, requirements = {}) {
        const delegationPrompt = `DELEGATION TO ${targetAgentType.toUpperCase()} AGENT:

TASK: ${taskDetails}

REQUIREMENTS: ${JSON.stringify(requirements, null, 2)}

Create a clear, specific task delegation including:
1. Exact deliverables expected
2. Format and structure requirements
3. Success criteria
4. Any constraints or guidelines
5. How this fits into the larger project

Make it actionable and unambiguous.`;

        return await this.process(delegationPrompt);
    }
}

module.exports = CoordinatorAgent;
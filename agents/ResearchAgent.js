import axios from 'axios';

class ResearchAgent {
    constructor() {
        this.agentId = 2; // On-chain agent ID
        this.model = "deepseek/deepseek-r1-0528:free"; // 1M context for research
        // Prefer dedicated key, fall back to shared key if needed
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseURL = 'https://openrouter.ai/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
                'X-Title': 'Agent Swarm - Research'
            }
        });

        this.systemPrompt = `You are an expert research agent specializing in fast, focused information gathering and analysis.

RESEARCH EXPERTISE:
- Market research and competitive intelligence
- Technical documentation and specifications
- Academic papers and scientific studies
- Industry trends and emerging technologies
- News analysis and current events
- Data verification and source validation

RESEARCH METHODOLOGY:
- Always verify information from multiple authoritative sources
- Distinguish between facts, opinions, and speculation
- Provide proper citations and confidence levels
- Identify knowledge gaps and limitations
- Cross-reference claims for accuracy
- Prioritize recent, credible sources

RESEARCH DELIVERABLES (DEMO MODE - KEEP OUTPUT TINY):
1. **Key Goal** - 1 short line describing what the user ultimately wants
2. **2–3 Bullets** - most important aspects, sections, or angles to cover
3. **1 Data Point or Example** - only if applicable

CONSTRAINTS:
- Absolute maximum of 5 short lines of output
- Do NOT repeat the original request verbatim
- No long paragraphs, no section headings
- Focus only on the single most important insight

Always be objective and concise. This is an agent-to-agent demo, so minimize tokens.`;
    }

    async research(topic, scope = {}) {
        try {
            const researchPrompt = `RESEARCH REQUEST (AGENT-TO-AGENT SUMMARY):

TOPIC (do not repeat this text back, only summarize it): ${topic}

SCOPE (for your reasoning only):
- Depth: ${scope.depth || 'Surface-level, key ideas only'}
- Time Frame: ${scope.timeFrame || 'Current and recent trends'}
- Geographic Focus: ${scope.geographic || 'Global with regional insights'}
- Source Types: ${scope.sources || 'Academic, industry reports, news, official data'}
- Specific Questions: ${scope.questions || 'What matters most for a landing page / UX / product description'}

OUTPUT FORMAT (max 5 short lines):
- 1 line: Key goal of the user
- 2–3 bullet lines: most important aspects/sections to include
- 1 line: optional data point or example if relevant
`;

            const messages = [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: researchPrompt }
            ];

            console.log(`🔍 Research Agent ${this.agentId} conducting research...`);

            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: messages,
                max_tokens: 256,
                temperature: 0.2
            });

            const result = response.data.choices[0].message.content;

            return {
                success: true,
                agentId: this.agentId,
                agentType: 'Research',
                model: this.model,
                response: result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Research Agent ${this.agentId} error:`, error.message);
            return {
                success: false,
                agentId: this.agentId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async factCheck(claims) {
        const factCheckPrompt = `FACT-CHECKING REQUEST:

CLAIMS TO VERIFY:
${Array.isArray(claims) ? claims.map((claim, i) => `${i + 1}. ${claim}`).join('\n') : claims}

For each claim, provide:
1. **Verification Status**: Verified/Disputed/Unverifiable
2. **Evidence**: Supporting or contradicting information
3. **Sources**: Credible references
4. **Confidence Level**: High/Medium/Low
5. **Context**: Additional nuance or important details

Be objective and thorough in your fact-checking analysis.`;

        return await this.research(factCheckPrompt);
    }
}

export default ResearchAgent;
import axios from 'axios';

class AnalystAgent {
    constructor() {
        this.agentId = 3; // On-chain agent ID
        this.model = "nvidia/nemotron-nano-9b-v2:free"; // Great for analytical reasoning
        // Prefer dedicated key, fall back to shared key if needed
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseURL = 'https://openrouter.ai/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
                'X-Title': 'Agent Swarm - Analyst'
            }
        });

        this.systemPrompt = `You are a senior data analyst specializing in extracting only the most essential insight from complex information and datasets.

ANALYTICAL EXPERTISE:
- Statistical analysis and data interpretation
- Pattern recognition and trend identification
- Performance metrics and KPI analysis
- Comparative analysis and benchmarking
- Predictive modeling and forecasting
- Risk assessment and scenario planning

ANALYTICAL APPROACH:
- Start with data quality assessment
- Apply appropriate statistical methods
- Identify correlations and causations
- Consider business context and implications
- Validate findings with multiple approaches
- Quantify uncertainty and confidence intervals

ANALYSIS DELIVERABLES (DEMO MODE - KEEP OUTPUT TINY):
1. **1–2 Key Insights** - ultra-short bullet points
2. **1 Recommendation** - one short line
3. **Confidence** - single word (High/Med/Low)

CONSTRAINTS:
- Maximum of 5 short lines of text total
- Do NOT repeat the original request or data verbatim
- No long paragraphs or headings
- Focus on what matters most for the next agent (Content / Code)

Always be concise and structured. This is an agent-to-agent demo, so minimize tokens.`;
    }

    async analyze(data, analysisType = 'comprehensive') {
        try {
            const analysisPrompt = `ANALYSIS REQUEST (CONDENSE FOR DOWNSTREAM AGENT):

DATA/INFORMATION (do not echo this back, just analyze it):
${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}

ANALYSIS TYPE: ${analysisType}

YOUR JOB:
- Ignore minor details and noise
- Find the single most important pattern or tradeoff
- Suggest the next best action for content / UI / product design

OUTPUT FORMAT (max 5 short lines):
- 1–2 bullet lines: key insights
- 1 line: recommendation
- 1 line: Confidence: High/Medium/Low
`;

            const messages = [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: analysisPrompt }
            ];

            console.log(`📊 Analyst Agent ${this.agentId} analyzing data...`);

            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: messages,
                max_tokens: 256,
                temperature: 0.1
            });

            const result = response.data.choices[0].message.content;

            return {
                success: true,
                agentId: this.agentId,
                agentType: 'Analyst',
                model: this.model,
                response: result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Analyst Agent ${this.agentId} error:`, error.message);
            return {
                success: false,
                agentId: this.agentId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async comparePerformance(metrics, benchmarks = {}) {
        const comparisonPrompt = `PERFORMANCE COMPARISON REQUEST:

CURRENT METRICS:
${JSON.stringify(metrics, null, 2)}

BENCHMARKS:
${JSON.stringify(benchmarks, null, 2)}

Analyze performance including:
1. Current vs benchmark comparison
2. Performance gaps and opportunities
3. Trend analysis and trajectory
4. Root cause analysis for variances
5. Improvement recommendations
6. Risk assessment
7. Forecasting and projections

Provide specific, quantified insights and actionable recommendations.`;

        return await this.analyze(comparisonPrompt, 'performance_comparison');
    }
}

export default AnalystAgent;
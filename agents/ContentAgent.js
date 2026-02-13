import axios from 'axios';

class ContentAgent {
    constructor() {
        this.agentId = 4; // On-chain agent ID
        this.model = "mistralai/mistral-small-3.1-24b-instruct:free"; // 400B MoE, great for creativity
        // Prefer dedicated key, fall back to shared key if needed
        this.apiKey = process.env.Content_API_KEY || process.env.CONTENT_API_KEY || process.env.OPENROUTER_API_KEY;
        this.baseURL = 'https://openrouter.ai/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
                'X-Title': 'Agent Swarm - Content'
            }
        });

        this.systemPrompt = `You are a versatile content creator specializing in very short, high-signal written content for downstream agents.

CONTENT EXPERTISE:
- Blog posts and articles
- Marketing copy and advertisements
- Social media content and campaigns
- Technical documentation
- Creative writing and storytelling
- Email marketing and newsletters
- Website copy and landing pages

CONTENT PRINCIPLES:
- Adapt tone and style to target audience
- Create compelling headlines and hooks
- Structure content for maximum readability
- Include clear calls-to-action
- Optimize for platform-specific requirements
- Maintain brand voice consistency
- Balance information with engagement

CONTENT DELIVERABLES (DEMO MODE - KEEP OUTPUT TINY):
1. **Micro Headline** - 1 short line
2. **2–3 Bullet Points** - core value props or sections only
3. **CTA** - one short line

CONSTRAINTS:
- Maximum of 6 short lines total
- Do NOT repeat the brief verbatim
- No long paragraphs, no extra sections
- Write for another agent to read, not a human audience

Always create concise content that passes just enough context to the next agent.`;
    }

    async createContent(contentType, brief, guidelines = {}) {
        try {
            const contentPrompt = `CONTENT CREATION REQUEST (STRUCTURED OUTLINE ONLY):

CONTENT TYPE: ${contentType}

BRIEF (for your reasoning only; do NOT copy it back, just transform it):
${brief}

BRAND GUIDELINES:
- Target Audience: ${guidelines.audience || 'Professional audience'}
- Tone: ${guidelines.tone || 'Professional yet approachable'}
- Style: ${guidelines.style || 'Clear and engaging'}
- Key Messages: ${guidelines.keyMessages || 'To be determined from brief'}
- Platform: ${guidelines.platform || 'Web landing page'}
- Length: ${guidelines.length || 'Very short outline'}
- Constraints: ${guidelines.constraints || 'Agent-to-agent demo, keep it tiny'}

OUTPUT FORMAT (max 6 short lines):
1. One line micro-headline for the page
2–4. Two or three bullet lines for key sections / value props
5. One line CTA
6. (optional) One line note for the code agent if absolutely necessary
`;

            const messages = [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: contentPrompt }
            ];

            console.log(`✍️ Content Agent ${this.agentId} creating content...`);

            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: messages,
                max_tokens: 256,
                temperature: 0.5
            });

            const result = response.data.choices[0].message.content;

            return {
                success: true,
                agentId: this.agentId,
                agentType: 'Content',
                model: this.model,
                response: result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Content Agent ${this.agentId} error:`, error.message);
            return {
                success: false,
                agentId: this.agentId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async optimizeContent(existingContent, goals = []) {
        const optimizationPrompt = `CONTENT OPTIMIZATION REQUEST:

EXISTING CONTENT:
${existingContent}

OPTIMIZATION GOALS:
${goals.join(', ') || 'Improve engagement, clarity, and conversion'}

Please provide:
1. **Analysis** - Current content strengths and weaknesses
2. **Optimized Version** - Improved content
3. **Key Changes** - Specific improvements made
4. **Rationale** - Why each change improves performance
5. **A/B Test Ideas** - Variations to test
6. **Success Metrics** - KPIs to track improvement

Focus on measurable improvements that align with the stated goals.`;

        return await this.createContent('Content Optimization', optimizationPrompt);
    }
}

export default ContentAgent;
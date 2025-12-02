const OpenAI = require('openai');
const NodeCache = require('node-cache');

// Cache summaries for 24 hours (86400 seconds)
const cache = new NodeCache({ stdTTL: 86400 });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate AI company summary
 */
async function generateCompanySummary(req, res) {
  const { symbol, companyName, industry, sector } = req.query;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      error: 'Symbol is required'
    });
  }

  // Check cache first
  const cacheKey = `ai_summary_${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true
    });
  }

  try {
    const prompt = `Provide a comprehensive, informative 4-5 sentence overview of ${companyName || symbol}${industry ? ` (${industry})` : ''}${sector ? ` in the ${sector} sector` : ''}. Include: 
1. What the company does, its primary products/services, and target markets
2. Its market position, scale, or competitive advantages
3. Key business segments or revenue drivers
4. Recent strategic initiatives, growth areas, or notable developments
5. Any relevant operational highlights or market dynamics

Keep it factual, professional, and informative for investors. Aim for 120-150 words.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial analyst providing detailed, factual company summaries for investors. Focus on business operations, market position, and key strategic facts. Avoid speculation or investment advice. Write in a clear, professional tone."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 350
    });

    const summary = completion.choices[0].message.content.trim();

    const result = {
      symbol,
      summary,
      generatedAt: new Date().toISOString()
    };

    // Cache the result
    cache.set(cacheKey, result);

    res.json({
      success: true,
      data: result,
      cached: false
    });

  } catch (error) {
    console.error('Error generating AI summary:', error.message);
    
    // Check if it's a quota/billing error
    const isQuotaError = error.message && (
      error.message.includes('quota') || 
      error.message.includes('429') ||
      error.message.includes('billing')
    );
    
    if (isQuotaError) {
      // Return error response for quota issues
      return res.status(503).json({
        success: false,
        error: 'AI summary temporarily unavailable. Please check OpenAI API quota and billing.',
        quotaError: true
      });
    }
    
    // Return a graceful fallback for other errors
    res.json({
      success: true,
      data: {
        symbol,
        summary: `${companyName || symbol} is a ${industry || 'publicly traded company'}${sector ? ` operating in the ${sector} sector` : ''}. For detailed information, please refer to the company's official investor relations materials.`,
        generatedAt: new Date().toISOString(),
        fallback: true
      },
      cached: false
    });
  }
}

module.exports = { generateCompanySummary };

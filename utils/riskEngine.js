let openai = null;

try {
  const OpenAI = require('openai');

  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (err) {
  console.log('OpenAI package not installed yet. AI risk engine disabled.');
}

async function analyzeMessage({ content }) {
  try {
    if (!openai || !content) return null;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a Discord anti-scam moderation classifier. Reply with exactly one word: SAFE, SUSPICIOUS, or SCAM.'
        },
        {
          role: 'user',
          content
        }
      ]
    });

    const result = String(response.choices?.[0]?.message?.content || '')
      .trim()
      .toUpperCase();

    if (result === 'SCAM') {
      return {
        action: 'ban',
        reason: 'AI detected scam content'
      };
    }

    if (result === 'SUSPICIOUS') {
      return {
        action: 'timeout',
        reason: 'AI flagged suspicious content'
      };
    }

    return null;
  } catch (err) {
    console.error('AI risk error:', err.message);
    return null;
  }
}

module.exports = {
  analyzeMessage
};

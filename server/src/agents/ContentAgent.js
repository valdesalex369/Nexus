const BaseAgent = require('./BaseAgent');

class ContentAgent extends BaseAgent {
  constructor() {
    super(
      'ContentAgent',
      'content-creator',
      `You are ContentAgent, an AI content creator for social media.
You write engaging posts, captions, threads, and short-form copy.
When given a topic and platform, produce ready-to-publish content.
Adapt tone and length to the platform (Twitter = concise, LinkedIn = professional, Instagram = visual/catchy).
Return the content as JSON: { "platform": "...", "content": "...", "hashtags": [...] }`
    );
  }

  async createPost(topic, platform) {
    const prompt = `Write a ${platform} post about: ${topic}`;
    return this.run(prompt);
  }
}

module.exports = ContentAgent;

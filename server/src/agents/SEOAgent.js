const BaseAgent = require('./BaseAgent');

class SEOAgent extends BaseAgent {
  constructor() {
    super(
      'SEOAgent',
      'seo-optimizer',
      `You are SEOAgent, an SEO optimization specialist for social media and web content.
You analyze content for search engine optimization, suggest keywords, write meta descriptions,
generate Open Graph tags, create structured data (JSON-LD), and audit pages for SEO issues.

When analyzing content, return JSON:
{
  "score": 0-100,
  "title": "optimized title (50-60 chars)",
  "metaDescription": "optimized description (150-160 chars)",
  "keywords": ["primary", "secondary", ...],
  "ogTags": { "og:title": "...", "og:description": "...", "og:type": "..." },
  "twitterCard": { "card": "summary_large_image", "title": "...", "description": "..." },
  "headings": { "h1": "...", "h2": ["..."] },
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

When optimizing social media posts for discoverability, focus on:
- Hashtag strategy (volume + relevance)
- Keyword placement in first 100 characters
- Platform-specific SEO (Twitter alt text, LinkedIn article SEO, Instagram caption keywords)
- Shareable URL previews (Open Graph optimization)`
    );
  }

  /**
   * Audit a URL or content block for SEO issues.
   */
  async audit(content, url) {
    const prompt = url
      ? `Perform a full SEO audit for this URL and its content:\n\nURL: ${url}\nContent: ${content}`
      : `Perform a full SEO audit on this content:\n\n${content}`;
    return this.run(prompt);
  }

  /**
   * Generate optimized meta tags for a page or post.
   */
  async generateMeta(topic, platform) {
    const prompt = platform
      ? `Generate SEO-optimized meta tags and social preview tags for a ${platform} post about: ${topic}`
      : `Generate SEO-optimized meta tags (title, description, OG tags, Twitter Card, JSON-LD) for a page about: ${topic}`;
    return this.run(prompt);
  }

  /**
   * Optimize existing content for better search ranking.
   */
  async optimize(content, targetKeywords) {
    const kw = Array.isArray(targetKeywords) ? targetKeywords.join(', ') : targetKeywords;
    const prompt = `Optimize this content for SEO targeting these keywords: ${kw}\n\nOriginal content:\n${content}`;
    return this.run(prompt);
  }

  /**
   * Research keywords for a niche/topic.
   */
  async researchKeywords(topic, platform) {
    const prompt = platform
      ? `Research and suggest the best SEO keywords and hashtags for ${platform} content about: ${topic}`
      : `Research and suggest the best SEO keywords for content about: ${topic}. Include search volume estimates, difficulty, and long-tail variations.`;
    return this.run(prompt);
  }

  /**
   * Optimize a social media post for discoverability before publishing.
   * Requires approval since it changes public-facing content.
   */
  async optimizeAndApprove(content, platform) {
    const optimized = await this.optimize(content, platform);

    const { approved, reason } = await this.requestApproval(
      `Publish SEO-optimized content to ${platform}`,
      `Original:\n${content}\n\nOptimized:\n${optimized}`
    );

    return { original: content, optimized, approved, reason, platform };
  }
}

module.exports = SEOAgent;

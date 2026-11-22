const { Router } = require('express');

const router = Router();

// GET /api/platforms/stats — check which platforms have keys configured
router.get('/stats', (req, res) => {
  const platforms = [
    {
      name: 'Twitter',
      connected: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_KEY !== 'your_twitter_api_key_here'),
    },
    {
      name: 'Instagram',
      connected: !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCESS_TOKEN !== 'your_instagram_access_token_here'),
    },
    {
      name: 'Facebook',
      connected: !!(process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_ACCESS_TOKEN !== 'your_facebook_access_token_here'),
    },
    {
      name: 'LinkedIn',
      connected: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ACCESS_TOKEN !== 'your_linkedin_access_token_here'),
    },
    {
      name: 'TikTok',
      connected: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_KEY !== 'your_tiktok_client_key_here'),
    },
  ];

  res.json({
    platforms,
    connectedCount: platforms.filter((p) => p.connected).length,
    total: platforms.length,
  });
});

module.exports = router;

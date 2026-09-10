import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

export const getAgents = () => api.get('/agents');
export const getScheduledPosts = () => api.get('/posts');
export const getPlatformStats = () => api.get('/platforms/stats');

// SEO endpoints
export const seoAudit = (content, url) => api.post('/seo/audit', { content, url });
export const seoMeta = (topic, platform) => api.post('/seo/meta', { topic, platform });
export const seoOptimize = (content, keywords) => api.post('/seo/optimize', { content, keywords });
export const seoKeywords = (topic, platform) => api.post('/seo/keywords', { topic, platform });

export default api;

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

export const getAgents = () => api.get('/agents');
export const getScheduledPosts = () => api.get('/posts');
export const getPlatformStats = () => api.get('/platforms/stats');

export default api;

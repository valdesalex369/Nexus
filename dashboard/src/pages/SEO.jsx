import { useState } from 'react';
import { seoAudit, seoMeta, seoKeywords, seoOptimize } from '../services/api';

export default function SEO() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('audit');
  const [input, setInput] = useState('');
  const [platform, setPlatform] = useState('');

  const run = async (fn) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fn();
      setResult(res.data.result);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const tabs = [
    { id: 'audit', label: 'SEO Audit' },
    { id: 'meta', label: 'Meta Tags' },
    { id: 'keywords', label: 'Keywords' },
    { id: 'optimize', label: 'Optimize' },
  ];

  return (
    <div>
      <h1>SEO Optimizer</h1>
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => { setTab(t.id); setResult(null); setError(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="seo-form">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            tab === 'audit' ? 'Paste content or URL to audit...'
            : tab === 'meta' ? 'Enter topic for meta tag generation...'
            : tab === 'keywords' ? 'Enter topic for keyword research...'
            : 'Paste content to optimize...'
          }
          rows={5}
        />
        {(tab === 'meta' || tab === 'keywords') && (
          <input
            type="text"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Platform (optional: twitter, linkedin, instagram)"
          />
        )}
        <button
          className="btn-primary"
          disabled={loading || !input.trim()}
          onClick={() => {
            switch (tab) {
              case 'audit': return run(() => seoAudit(input));
              case 'meta': return run(() => seoMeta(input, platform));
              case 'keywords': return run(() => seoKeywords(input, platform));
              case 'optimize': return run(() => seoOptimize(input, platform));
            }
          }}
        >
          {loading ? 'Running SEOAgent...' : 'Run'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box">
          <h3>Result</h3>
          <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

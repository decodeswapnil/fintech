const corsHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

/**
 * Worker that proxies requests to FinancialModelingPrep and rotates API keys
 * when upstream returns quota/payment errors (402/429).
 *
 * Configuration (set via environment):
 * - FMP_API_KEYS: optional comma-separated list of API keys to rotate through
 * - FMP_API_KEY: optional single API key (used if FMP_API_KEYS is not provided)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Build keys array from env variables. Prefer FMP_API_KEYS (comma-separated),
    // falling back to single FMP_API_KEY for compatibility.
    const keysRaw = env.FMP_API_KEYS || env.FMP_API_KEY || "";
    const keys = keysRaw.split(',').map(k => k && k.trim()).filter(Boolean);
    if (!keys.length) {
      return new Response(JSON.stringify({ error: 'No FMP API keys configured' }), { status: 500, headers: corsHeaders });
    }

    const BASE = "https://financialmodelingprep.com/stable";

    // Only support a small set of proxy routes used by the frontend
    let path;
    if (url.pathname === "/quote") {
      const symbol = url.searchParams.get("symbol");
      if (!symbol) return new Response(JSON.stringify({ error: "Missing symbol" }), { status: 400, headers: corsHeaders });
      path = `/quote?symbol=${encodeURIComponent(symbol)}`;
    } else if (url.pathname === "/indices") {
      // Fetch a small set of ETFs that track major US indices and map them to
      // index-like values server-side so the frontend can render real-time indices.
      // We use SPY (S&P 500), QQQ (NASDAQ), DIA (Dow Jones) as proxies.
      path = `/quote?symbol=SPY,QQQ,DIA`;
    } else if (url.pathname === "/search-name") {
      const query = url.searchParams.get("query");
      if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400, headers: corsHeaders });
      path = `/search-name?query=${encodeURIComponent(query)}`;
    } else if (url.pathname === "/stream") {
      // Not implemented proxy for SSE/stream in this worker. Return 404.
      return new Response(JSON.stringify({ error: "Stream endpoint not supported by proxy" }), { status: 404, headers: corsHeaders });
    } else {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
    }

    // Attempt to fetch with rotation over provided keys. Start from a pseudo-random
    // offset to distribute load across keys for different worker instances.
    const startIndex = Math.floor(Math.random() * keys.length);
    let lastError = null;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[(startIndex + i) % keys.length];
      const target = `${BASE}${path}&apikey=${encodeURIComponent(key)}`;

      let upstream;
      try {
        upstream = await fetch(target, {
          headers: { "Accept": "application/json" }
        });
      } catch (err) {
        lastError = { type: 'fetch_error', details: err.message };
        // Try the next key
        continue;
      }

      // If upstream indicates quota/payment or rate-limiting, try next key
      if (upstream.status === 402 || upstream.status === 429) {
        lastError = { type: 'quota', status: upstream.status };
        // try next API key
        continue;
      }

      // For other non-ok statuses, surface the error immediately
      if (!upstream.ok) {
        const bodyText = await upstream.text().catch(() => '');
        return new Response(JSON.stringify({ error: 'Upstream API error', status: upstream.status, body: bodyText }), { status: upstream.status, headers: corsHeaders });
      }

      // Parse JSON response
      let data;
      try {
        data = await upstream.json();
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid JSON from upstream' }), { status: 502, headers: corsHeaders });
      }

      // Normalize /quote to a single object (upstream returns an array)
      if (url.pathname === "/quote") {
        if (Array.isArray(data)) data = data[0] || null;
      }

      // If caller requested /indices, transform ETF quotes into index-like values
      if (url.pathname === "/indices") {
        // data should be an array of ETF quotes (SPY, QQQ, DIA)
        if (!Array.isArray(data) || data.length === 0) {
          return new Response(JSON.stringify({ error: 'No index data available' }), { status: 502, headers: corsHeaders });
        }

        const bySymbol = (arr) => (arr || []).reduce((acc, it) => { if (it && it.symbol) acc[it.symbol.toUpperCase()] = it; return acc; }, {});
        const map = bySymbol(data);

        // Multipliers chosen to scale ETF prices to index magnitudes
        const multipliers = { SPY: 10, QQQ: 40, DIA: 100 };

        const indices = [];
        // S&P 500 (SPX) from SPY
        if (map.SPY) {
          const etf = map.SPY;
          const m = multipliers.SPY;
          const value = +(Number(etf.price) * m).toFixed(2);
          const change = +(Number(etf.change || 0) * m).toFixed(2);
          const changePercent = Number(etf.changesPercentage ?? etf.changePercentage ?? 0);
          indices.push({ symbol: 'SPX', name: 'S&P 500', value, change, changePercent });
        }
        // NASDAQ Composite (IXIC) from QQQ
        if (map.QQQ) {
          const etf = map.QQQ;
          const m = multipliers.QQQ;
          const value = +(Number(etf.price) * m).toFixed(2);
          const change = +(Number(etf.change || 0) * m).toFixed(2);
          const changePercent = Number(etf.changesPercentage ?? etf.changePercentage ?? 0);
          indices.push({ symbol: 'IXIC', name: 'NASDAQ Composite', value, change, changePercent });
        }
        // Dow Jones Industrial Average (DJI) from DIA
        if (map.DIA) {
          const etf = map.DIA;
          const m = multipliers.DIA;
          const value = +(Number(etf.price) * m).toFixed(2);
          const change = +(Number(etf.change || 0) * m).toFixed(2);
          const changePercent = Number(etf.changesPercentage ?? etf.changePercentage ?? 0);
          indices.push({ symbol: 'DJI', name: 'Dow Jones', value, change, changePercent });
        }

        const usedIndex = (startIndex + i) % keys.length;
        const responseHeaders = Object.assign({}, corsHeaders, { 'X-FMP-Key-Used': String(usedIndex) });
        return new Response(JSON.stringify(indices), { status: 200, headers: responseHeaders });
      }

      // Include a debug header with the index of the key used (no key material)
      const usedIndex = (startIndex + i) % keys.length;
      const responseHeaders = Object.assign({}, corsHeaders, { 'X-FMP-Key-Used': String(usedIndex) });
      return new Response(JSON.stringify(data), { status: 200, headers: responseHeaders });
    }

    // If we get here, all keys failed due to quota/fetch errors
    const errBody = lastError || { error: 'All FMP keys exhausted or unavailable' };
    return new Response(JSON.stringify({ error: 'FMP quota or network errors', details: errBody }), { status: 502, headers: corsHeaders });
  }
};
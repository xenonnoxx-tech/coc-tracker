const express = require("express");
const axios = require("axios");

const app = express();

// ─── CONFIG ───────────────────────────────────────────────
const API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiIsImtpZCI6IjI4YTMxOGY3LTAwMDAtYTFlYi03ZmExLTJjNzQzM2M2Y2NhNSJ9.eyJpc3MiOiJzdXBlcmNlbGwiLCJhdWQiOiJzdXBlcmNlbGw6Z2FtZWFwaSIsImp0aSI6ImNiZDhhZThiLWM4NTYtNGQyYy05NDg4LTE5YWViOTVjODUxZiIsImlhdCI6MTc3NDMwMjU2MSwic3ViIjoiZGV2ZWxvcGVyLzVkYTk0MTAzLTM5ZGEtZWJiZS03NjI2LTAxZmE0ZDBiZGQ0YSIsInNjb3BlcyI6WyJjbGFzaCJdLCJsaW1pdHMiOlt7InRpZXIiOiJkZXZlbG9wZXIvc2lsdmVyIiwidHlwZSI6InRocm90dGxpbmcifSx7ImNpZHJzIjpbIjc0LjIyMC40OC4yNDYiXSwidHlwZSI6ImNsaWVudCJ9XX0.0S0QenNZEefQEJuRO_FMlF3bet8OeOR9G0njMoEEDqpuK3Zo3p5xqWAJvtvP4OcPFDjTYLWmQBDeCYeM-e9nsQ";
let CLAN_TAG = "C92R9JCJ";
const REFRESH_INTERVAL = 60000;
// ──────────────────────────────────────────────────────────

app.use(express.static("public"));
app.use(express.json());

const headers = { Authorization: `Bearer ${API_KEY}` };

// ── API endpoints ──

app.get("/api/test", async (req, res) => {
  try {
    await axios.get("https://api.clashofclans.com/v1/clans?name=test&limit=1", { headers });
    res.json({ ok: true, message: "API key is working" });
  } catch (err) {
    res.status(err.response?.status || 500).json({ ok: false, error: err.response?.data?.message || err.message });
  }
});

app.get("/api/data", (req, res) => {
  if (cachedData) return res.json(cachedData);
  res.json({ loading: true });
});

app.get("/api/search-clan", async (req, res) => {
  let query = (req.query.name || "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });
  const looksLikeTag = /^#?[A-Z0-9]{4,12}$/i.test(query);
  try {
    if (looksLikeTag) {
      const tag = query.startsWith("#") ? query : `#${query}`;
      const result = await axios.get(`https://api.clashofclans.com/v1/clans/${encodeURIComponent(tag)}`, { headers });
      const c = result.data;
      return res.json([{ tag: c.tag, name: c.name, level: c.clanLevel, members: c.members, badgeUrl: c.badgeUrls?.small }]);
    }
    const result = await axios.get(`https://api.clashofclans.com/v1/clans?name=${encodeURIComponent(query)}&limit=10`, { headers });
    res.json(result.data.items.map(c => ({ tag: c.tag, name: c.name, level: c.clanLevel, members: c.members, badgeUrl: c.badgeUrls?.small })));
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

app.get("/api/search-player", async (req, res) => {
  let tag = (req.query.tag || "").trim();
  if (!tag) return res.status(400).json({ error: "tag is required" });
  if (!tag.startsWith("#")) tag = `#${tag}`;
  try {
    const result = await axios.get(`https://api.clashofclans.com/v1/players/${encodeURIComponent(tag)}`, { headers });
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data?.message || err.message, status });
  }
});

app.post("/api/set-clan", async (req, res) => {
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ error: "tag is required" });
  CLAN_TAG = tag.replace("#", "");
  cachedData = null;
  res.json({ ok: true });
  refreshData();
});

// ── Data fetching ──

async function fetchClan() {
  try {
    const res = await axios.get(`https://api.clashofclans.com/v1/clans/%23${CLAN_TAG}`, { headers });
    return res.data;
  } catch (err) {
    console.error("Clan fetch error:", err.response?.data?.message || err.message);
    return null;
  }
}

async function fetchPlayer(tag) {
  try {
    const res = await axios.get(`https://api.clashofclans.com/v1/players/${encodeURIComponent(tag)}`, { headers });
    return res.data;
  } catch (err) {
    console.error(`Player fetch error (${tag}):`, err.response?.data?.message || err.message);
    return null;
  }
}

async function fetchAllMembers() {
  const clan = await fetchClan();
  if (!clan) return null;

  const memberTags = clan.memberList.map((m) => m.tag);
  const batchSize = 10;
  const players = [];
  for (let i = 0; i < memberTags.length; i += batchSize) {
    const batch = memberTags.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchPlayer));
    players.push(...results.filter(Boolean));
    if (i + batchSize < memberTags.length) await new Promise((r) => setTimeout(r, 500));
  }

  players.sort((a, b) => b.trophies - a.trophies);

  return {
    clan: { name: clan.name, tag: clan.tag, level: clan.clanLevel, members: clan.members, warWins: clan.warWins, badgeUrl: clan.badgeUrls?.medium },
    players,
    updatedAt: new Date().toISOString(),
  };
}

let cachedData = null;

async function refreshData() {
  console.log(`[${new Date().toLocaleTimeString()}] Fetching data...`);
  const data = await fetchAllMembers();
  if (data) {
    cachedData = data;
    console.log(`[${new Date().toLocaleTimeString()}] Data cached (${data.players.length} players)`);
  }
}

setInterval(refreshData, REFRESH_INTERVAL);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n CoC Tracker running → http://localhost:${PORT}\n`);
  refreshData();
});

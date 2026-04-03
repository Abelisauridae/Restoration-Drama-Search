const columns = {
  plays: [
    ["title", "Title"],
    ["date", "Date"],
    ["genre", "Genre"],
    ["stage", "Stage"],
    ["author", "Author"],
    ["theatre", "Theatre"],
  ],
  text: [
    ["title", "Title"],
    ["date", "Date"],
    ["stage", "Stage"],
    ["genre", "Genre"],
    ["excerpt", "Excerpt"],
  ],
  hits: [
    ["title", "Title"],
    ["date", "Date"],
    ["theme", "Theme"],
    ["term", "Term"],
    ["precision", "Precision"],
    ["locator", "Locator"],
  ],
  summary: [
    ["title", "Title"],
    ["date", "Date"],
    ["genre", "Genre"],
    ["gambling", "Gambling"],
    ["combat", "Combat"],
    ["overlap", "Overlap"],
    ["top_terms", "Top Terms"],
  ],
};

const state = {
  rows: {
    plays: [],
    text: [],
    hits: [],
    summary: [],
  },
  datasets: {
    plays: [],
    hits: [],
    summary: [],
    playById: new Map(),
    textManifest: null,
    textShardCache: new Map(),
  },
  coreLoaded: false,
};

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsText(value, needle) {
  if (!needle) {
    return true;
  }
  return String(value || "").toLowerCase().includes(String(needle).toLowerCase());
}

function collapseSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseYear(value) {
  const match = String(value || "").match(/(1[5-9]\d{2}|20\d{2})/);
  return match ? Number(match[1]) : null;
}

function matchesYearOrDecade(row, query) {
  const cleaned = collapseSpace(query);
  if (!cleaned) {
    return true;
  }

  if (/^(1[5-9]\d{2}|20\d{2})$/.test(cleaned)) {
    return row.year === Number(cleaned);
  }

  if (/^(1[5-9]\d{2}|20\d{2})s$/i.test(cleaned)) {
    const decade = row.year == null ? "" : `${Math.floor(row.year / 10) * 10}s`;
    return decade.toLowerCase() === cleaned.toLowerCase();
  }

  const decade = row.year == null ? "" : `${Math.floor(row.year / 10) * 10}s`;
  return containsText(decade, cleaned);
}

function safeInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function playUrl(row, focus = "") {
  const params = new URLSearchParams({ id: row.id });
  if (focus) {
    params.set("focus", focus);
  }
  return `./play.html?${params.toString()}`;
}

function transferHitsFiltersToText() {
  const mappings = [
    ["hits-title", "text-title"],
    ["hits-author", "text-author"],
    ["hits-genre", "text-genre"],
    ["hits-stage", "text-stage"],
    ["hits-since", "text-since"],
    ["hits-until", "text-until"],
  ];
  mappings.forEach(([fromId, toId]) => {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (from && to) {
      to.value = from.value;
    }
  });
}

async function launchTextSearch(query) {
  const cleaned = String(query || "").trim();
  if (!cleaned) {
    throw new Error("Enter a word or phrase to search.");
  }
  document.getElementById("text-query").value = cleaned;
  switchTab("text");
  await runText();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}.`);
  }
  return response.json();
}

async function ensureCoreData() {
  if (state.coreLoaded) {
    return;
  }

  setStatus("Loading search data...");
  const [plays, hits, summary] = await Promise.all([
    fetchJson("./data/plays.json"),
    fetchJson("./data/hits.json"),
    fetchJson("./data/summary.json"),
  ]);

  state.datasets.plays = plays;
  state.datasets.hits = hits;
  state.datasets.summary = summary;
  state.datasets.playById = new Map(plays.map((row) => [row.id, row]));
  state.coreLoaded = true;
}

async function ensureTextManifest() {
  if (!state.datasets.textManifest) {
    state.datasets.textManifest = await fetchJson("./data/text-shards/manifest.json");
  }
  return state.datasets.textManifest;
}

async function ensureTextShard(filename) {
  if (!state.datasets.textShardCache.has(filename)) {
    state.datasets.textShardCache.set(filename, fetchJson(`./data/text-shards/${filename}`));
  }
  return state.datasets.textShardCache.get(filename);
}

function switchTab(name) {
  for (const button of document.querySelectorAll(".tab-button")) {
    button.classList.toggle("active", button.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.classList.toggle("active", panel.id === `tab-${name}`);
  }
}

function renderTable(name, rows, emptyDetail = "No results.") {
  state.rows[name] = rows;

  const table = document.getElementById(`${name}-table`);
  const detail = document.getElementById(`${name}-detail`);
  const count = document.getElementById(`${name}-count`);
  const cols = columns[name];

  table.innerHTML = "";
  detail.textContent = rows.length ? "Select a row to inspect it." : emptyDetail;
  count.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}.`;

  if (!rows.length) {
    return;
  }

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  cols.forEach(([, label]) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => selectRow(name, index));

    cols.forEach(([key]) => {
      const td = document.createElement("td");
      if (key === "title" && row.play_url) {
        const link = document.createElement("a");
        link.href = row.play_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "play-link";
        link.textContent = row[key] || "";
        link.addEventListener("click", (event) => event.stopPropagation());
        td.appendChild(link);
      } else {
        td.textContent = row[key] || "";
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  selectRow(name, 0);
}

function selectRow(name, index) {
  const table = document.getElementById(`${name}-table`);
  const detail = document.getElementById(`${name}-detail`);
  const rows = state.rows[name] || [];
  const tableRows = table.querySelectorAll("tbody tr");

  tableRows.forEach((row, rowIndex) => {
    row.classList.toggle("selected", rowIndex === index);
  });

  detail.textContent = rows[index]?.detail || "No detail available.";
}

function commonMatch(row, filters) {
  if (!containsText(row.search_title || row.canonical_title, filters.title)) {
    return false;
  }
  if (!containsText(row.search_author || row.author, filters.author)) {
    return false;
  }
  if (!containsText(row.genre, filters.genre)) {
    return false;
  }
  if (!matchesYearOrDecade(row, filters.yearOrDecade)) {
    return false;
  }
  if (!containsText(row.stage, filters.stage)) {
    return false;
  }
  if (!containsText(row.search_theatre || row.theatre, filters.theatre)) {
    return false;
  }

  if (filters.since && (row.year == null || row.year < safeInt(filters.since, 0))) {
    return false;
  }
  if (filters.until && (row.year == null || row.year > safeInt(filters.until, 9999))) {
    return false;
  }

  return true;
}

function buildTextPattern(query, regex, caseSensitive) {
  const flags = caseSensitive ? "g" : "gi";
  return new RegExp(regex ? query : escapeRegExp(query), flags);
}

function buildExcerpt(text, match, contextChars) {
  const left = Math.max(0, match.index - contextChars);
  const right = Math.min(text.length, match.index + match[0].length + contextChars);
  let excerpt = collapseSpace(text.slice(left, right));
  if (left > 0) {
    excerpt = `... ${excerpt}`;
  }
  if (right < text.length) {
    excerpt = `${excerpt} ...`;
  }
  return excerpt;
}

async function runPlays() {
  await ensureCoreData();
  setStatus("Searching plays...");

  const filters = {
    title: document.getElementById("plays-title").value,
    author: document.getElementById("plays-author").value,
    genre: document.getElementById("plays-genre").value,
    yearOrDecade: document.getElementById("plays-decade").value,
    stage: document.getElementById("plays-stage").value,
    theatre: document.getElementById("plays-theatre").value,
    since: document.getElementById("plays-since").value,
    until: document.getElementById("plays-until").value,
  };
  const limit = safeInt(document.getElementById("plays-limit").value, 250);
  const hasUbiq = document.getElementById("plays-ubiq").value;

  let rows = state.datasets.plays.filter((row) => commonMatch(row, filters));
  if (hasUbiq === "yes") {
    rows = rows.filter((row) => row.has_ubiq === "yes");
  } else if (hasUbiq === "no") {
    rows = rows.filter((row) => row.has_ubiq !== "yes");
  }

  rows = rows.slice(0, limit).map((row) => ({ ...row, play_url: playUrl(row) }));
  renderTable("plays", rows);
  setStatus(`Loaded ${rows.length} plays.`);
}

async function runHits() {
  await ensureCoreData();
  setStatus("Searching theme hits...");

  const filters = {
    title: document.getElementById("hits-title").value,
    author: document.getElementById("hits-author").value,
    genre: document.getElementById("hits-genre").value,
    yearOrDecade: document.getElementById("hits-decade").value,
    stage: document.getElementById("hits-stage").value,
    theatre: "",
    since: document.getElementById("hits-since").value,
    until: document.getElementById("hits-until").value,
  };

  const theme = document.getElementById("hits-theme").value;
  const precision = document.getElementById("hits-precision").value;
  const term = document.getElementById("hits-term").value;
  const category = document.getElementById("hits-category").value;
  const limit = safeInt(document.getElementById("hits-limit").value, 300);

  let rows = state.datasets.hits.filter((row) => commonMatch(row, filters));

  if (theme !== "all") {
    rows = rows.filter((row) => row.theme === theme);
  }
  if (precision !== "all") {
    rows = rows.filter((row) => row.precision === precision);
  }
  if (term) {
    rows = rows.filter((row) =>
      containsText(
        [
          row.term,
          row.focus,
          row.category,
          row.title,
          row.author,
          row.locator,
          row.detail,
        ].join(" "),
        term,
      ),
    );
  }
  if (category) {
    rows = rows.filter((row) => containsText(row.category, category));
  }

  rows = rows.slice(0, limit).map((row) => ({ ...row, play_url: playUrl(row, row.focus || "") }));
  renderTable("hits", rows);
  setStatus(`Loaded ${rows.length} hit rows.`);
}

async function runSummary() {
  await ensureCoreData();
  setStatus("Searching play summaries...");

  const filters = {
    title: document.getElementById("summary-title").value,
    author: document.getElementById("summary-author").value,
    genre: document.getElementById("summary-genre").value,
    yearOrDecade: document.getElementById("summary-decade").value,
    stage: document.getElementById("summary-stage").value,
    theatre: "",
    since: document.getElementById("summary-since").value,
    until: document.getElementById("summary-until").value,
  };

  const minGambling = safeInt(document.getElementById("summary-min-gambling").value, 0);
  const minCombat = safeInt(document.getElementById("summary-min-combat").value, 0);
  const minOverlap = safeInt(document.getElementById("summary-min-overlap").value, 0);
  const limit = safeInt(document.getElementById("summary-limit").value, 250);
  const bothThemes = document.getElementById("summary-both").checked;
  const overlapOnly = document.getElementById("summary-overlap-only").checked;

  let rows = state.datasets.summary.filter((row) => commonMatch(row, filters));
  rows = rows.filter((row) => {
    const gambling = safeInt(row.gambling, 0);
    const combat = safeInt(row.combat, 0);
    const overlap = safeInt(row.overlap, 0);
    if (gambling < minGambling || combat < minCombat || overlap < minOverlap) {
      return false;
    }
    if (bothThemes && !(gambling > 0 && combat > 0)) {
      return false;
    }
    if (overlapOnly && overlap <= 0) {
      return false;
    }
    return true;
  });

  rows = rows.slice(0, limit).map((row) => ({ ...row, play_url: playUrl(row) }));
  renderTable("summary", rows);
  setStatus(`Loaded ${rows.length} play summaries.`);
}

async function runText() {
  await ensureCoreData();

  const query = document.getElementById("text-query").value.trim();
  if (!query) {
    renderTable("text", [], "Enter a query to search the corpus.");
    setStatus("Enter a query to search the corpus.");
    return;
  }

  const filters = {
    title: document.getElementById("text-title").value,
    author: document.getElementById("text-author").value,
    genre: document.getElementById("text-genre").value,
    yearOrDecade: "",
    stage: document.getElementById("text-stage").value,
    theatre: "",
    since: document.getElementById("text-since").value,
    until: document.getElementById("text-until").value,
  };

  const regex = document.getElementById("text-regex").checked;
  const caseSensitive = document.getElementById("text-case").checked;
  const limit = safeInt(document.getElementById("text-limit").value, 100);
  const perPlay = safeInt(document.getElementById("text-per-play").value, 3);
  const contextChars = safeInt(document.getElementById("text-context").value, 90);

  let pattern;
  try {
    pattern = buildTextPattern(query, regex, caseSensitive);
  } catch (error) {
    throw new Error(`Invalid regular expression: ${error.message}`);
  }

  const candidates = state.datasets.plays.filter((row) => commonMatch(row, filters));
  const candidateIds = new Set(candidates.map((row) => row.id));
  if (!candidateIds.size) {
    renderTable("text", [], "No plays matched the metadata filters.");
    setStatus("No plays matched the metadata filters.");
    return;
  }

  const manifest = await ensureTextManifest();
  const rows = [];
  const perPlayCounts = new Map();

  for (let index = 0; index < manifest.shards.length; index += 1) {
    const shardInfo = manifest.shards[index];
    setStatus(`Searching full text... shard ${index + 1} of ${manifest.shards.length}.`);
    const shard = await ensureTextShard(shardInfo.file);

    for (const record of shard.records) {
      if (!candidateIds.has(record.id)) {
        continue;
      }

      const play = state.datasets.playById.get(record.id);
      if (!play) {
        continue;
      }

      let countForPlay = perPlayCounts.get(record.id) || 0;
      if (countForPlay >= perPlay) {
        continue;
      }

      const localPattern = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = localPattern.exec(record.text)) !== null) {
        const excerpt = buildExcerpt(record.text, match, contextChars);
        rows.push({
          id: play.id,
          title: play.title,
          canonical_title: play.canonical_title,
          date: play.date,
          stage: play.stage,
          genre: play.genre,
          excerpt,
          detail: [
            `Title: ${play.canonical_title}`,
            `Date: ${play.date}`,
            `Stage: ${play.stage}`,
            `Genre: ${play.genre}`,
            `Author: ${play.author_full}`,
            `File: ${play.id}`,
            "",
            excerpt,
          ].join("\n"),
          play_url: playUrl(play, regex ? "" : query),
        });
        countForPlay += 1;
        perPlayCounts.set(record.id, countForPlay);

        if (!match[0]) {
          localPattern.lastIndex += 1;
        }
        if (countForPlay >= perPlay || rows.length >= limit) {
          break;
        }
      }

      if (rows.length >= limit) {
        break;
      }
    }

    if (rows.length >= limit) {
      break;
    }
  }

  renderTable("text", rows, "No matches found.");
  setStatus(`Loaded ${rows.length} text matches.`);
}

function reset(ids, defaults = {}) {
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    if (element.type === "checkbox") {
      element.checked = Boolean(defaults[id]);
    } else {
      element.value = defaults[id] ?? "";
    }
  });
}

function showError(error) {
  const message = error?.message || "Something went wrong.";
  setStatus(message);
  window.alert(message);
}

function attachHandlers() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.getElementById("hero-search").addEventListener("click", () => {
    launchTextSearch(document.getElementById("hero-query").value).catch(showError);
  });
  document.getElementById("hero-query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      launchTextSearch(event.currentTarget.value).catch(showError);
    }
  });

  document.getElementById("plays-search").addEventListener("click", () => runPlays().catch(showError));
  document.getElementById("plays-reset").addEventListener("click", () => {
    reset(["plays-title", "plays-author", "plays-genre", "plays-decade", "plays-stage", "plays-theatre", "plays-since", "plays-until"], {});
    reset(["plays-limit"], { "plays-limit": "250" });
    reset(["plays-ubiq"], { "plays-ubiq": "all" });
    runPlays().catch(showError);
  });

  document.getElementById("text-search").addEventListener("click", () => runText().catch(showError));
  document.getElementById("text-reset").addEventListener("click", () => {
    reset(["text-query", "text-title", "text-author", "text-genre", "text-stage", "text-since", "text-until"], {});
    reset(["text-limit"], { "text-limit": "100" });
    reset(["text-per-play"], { "text-per-play": "3" });
    reset(["text-context"], { "text-context": "90" });
    reset(["text-regex", "text-case"], {});
    document.getElementById("text-table").innerHTML = "";
    document.getElementById("text-detail").textContent = "Select a row to inspect the match.";
    document.getElementById("text-count").textContent = "Enter a query to search the corpus.";
    setStatus("Text filters reset.");
  });

  document.getElementById("hits-search").addEventListener("click", () => runHits().catch(showError));
  document.getElementById("hits-use-text").addEventListener("click", () => {
    transferHitsFiltersToText();
    launchTextSearch(document.getElementById("hits-term").value).catch(showError);
  });
  document.getElementById("hits-reset").addEventListener("click", () => {
    reset(["hits-term", "hits-category", "hits-title", "hits-author", "hits-genre", "hits-decade", "hits-stage", "hits-since", "hits-until"], {});
    reset(["hits-theme"], { "hits-theme": "all" });
    reset(["hits-precision"], { "hits-precision": "all" });
    reset(["hits-limit"], { "hits-limit": "300" });
    document.getElementById("hits-table").innerHTML = "";
    document.getElementById("hits-detail").textContent = "Select a row to inspect the hit.";
    document.getElementById("hits-count").textContent = "Search the thematic hit table.";
    setStatus("Theme-hit filters reset.");
  });

  document.getElementById("summary-search").addEventListener("click", () => runSummary().catch(showError));
  document.getElementById("summary-reset").addEventListener("click", () => {
    reset(["summary-title", "summary-author", "summary-genre", "summary-decade", "summary-stage", "summary-since", "summary-until"], {});
    reset(["summary-min-gambling", "summary-min-combat", "summary-min-overlap"], {
      "summary-min-gambling": "0",
      "summary-min-combat": "0",
      "summary-min-overlap": "0",
    });
    reset(["summary-limit"], { "summary-limit": "250" });
    reset(["summary-both", "summary-overlap-only"], {});
    runSummary().catch(showError);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    attachHandlers();
    await ensureCoreData();
    await runPlays();
    await runSummary();
    setStatus("Ready.");
  } catch (error) {
    showError(error);
  }
});

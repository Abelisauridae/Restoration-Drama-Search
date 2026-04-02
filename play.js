function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitPlayText(text) {
  const marker = "\n---";
  if (!text.includes(marker)) {
    return ["", text];
  }
  const parts = text.split(marker, 2);
  return [parts[0].trim(), parts[1].trim()];
}

function highlightHtml(text, focus) {
  if (!focus) {
    return escapeHtml(text);
  }

  const pattern = new RegExp(focus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let lastIndex = 0;
  let result = "";
  let match;

  while ((match = pattern.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += `<mark>${escapeHtml(match[0])}</mark>`;
    lastIndex = match.index + match[0].length;
    if (!match[0]) {
      pattern.lastIndex += 1;
    }
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}.`);
  }
  return response.json();
}

async function initPlay() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const focus = (params.get("focus") || "").trim();

  if (!id) {
    throw new Error("No play was specified.");
  }

  const lookup = await fetchJson("./data/play_lookup.json");
  const play = lookup[id];
  if (!play) {
    throw new Error("That play is not in the published corpus.");
  }

  document.title = `${play.title} | Restoration Drama Search`;
  document.getElementById("play-title").textContent = play.title;
  document.getElementById("play-path").textContent = play.path;

  const metaLines = [
    `Title: ${play.title}`,
    `Date: ${play.date || ""}`,
    `Stage: ${play.stage || ""}`,
    `Author: ${play.author || ""}`,
    `Genre: ${play.genre || ""}`,
    `Theatre: ${play.theatre || ""}`,
    `File: ${play.path || ""}`,
  ];
  if (focus) {
    metaLines.push(`Focus term: ${focus}`);
  }

  document.getElementById("play-meta").innerHTML = metaLines
    .filter((line) => line.startsWith("File:") || line.split(": ").slice(1).join(": ").trim())
    .map((line) => escapeHtml(line))
    .join("<br>");

  const sourceLines = [];
  if (play.source_title) {
    sourceLines.push(`Source title: ${play.source_title}`);
  }
  if (play.notes) {
    sourceLines.push(`Notes: ${play.notes}`);
  }
  if (sourceLines.length) {
    const block = document.getElementById("play-source");
    block.textContent = sourceLines.join("\n");
    block.classList.remove("hidden");
  }

  const response = await fetch(`./${play.text_path}`);
  if (!response.ok) {
    throw new Error("Could not load the play text.");
  }
  const text = await response.text();
  const [header, body] = splitPlayText(text);

  if (header) {
    const block = document.getElementById("play-source");
    if (block.classList.contains("hidden")) {
      block.classList.remove("hidden");
      block.textContent = header;
    } else {
      block.textContent += `\n\n${header}`;
    }
  }

  document.getElementById("play-text").innerHTML = highlightHtml(body || text, focus);

  const firstMark = document.querySelector("mark");
  if (firstMark) {
    firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function showPlayError(error) {
  const message = error?.message || "Something went wrong.";
  document.title = "Restoration Drama Search";
  document.getElementById("play-title").textContent = "Play unavailable";
  document.getElementById("play-meta").textContent = message;
  document.getElementById("play-text").textContent = "";
}

window.addEventListener("DOMContentLoaded", () => {
  initPlay().catch(showPlayError);
});

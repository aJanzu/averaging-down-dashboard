const STORAGE_KEY = "averaging-down-dashboard-holdings";
const API_KEY_STORAGE = "averaging-down-dashboard-api-key";

const PROXY_MAP = {
  SWPPX: "SPY",
  FXAIX: "SPY",
  VFIAX: "VOO",
};

const STARTER_HOLDINGS = [
  {
    ticker: "AAPL",
    pricingTicker: "",
    shares: 10,
    totalCostBasis: 1823.5,
    targetAllocation: 12,
    notes: "Core compounder",
    currentPrice: null,
    fiftyTwoWeekHigh: null,
    dropFromHigh: null,
    fetchedAt: null,
  },
  {
    ticker: "NVDA",
    pricingTicker: "",
    shares: 6,
    totalCostBasis: 584.4,
    targetAllocation: 10,
    notes: "High conviction, watch sizing",
    currentPrice: null,
    fiftyTwoWeekHigh: null,
    dropFromHigh: null,
    fetchedAt: null,
  },
  {
    ticker: "SWPPX",
    pricingTicker: "SPY",
    shares: 18,
    totalCostBasis: 1281.96,
    targetAllocation: 18,
    notes: "Priced via ETF proxy",
    currentPrice: null,
    fiftyTwoWeekHigh: null,
    dropFromHigh: null,
    fetchedAt: null,
  },
];

const state = {
  holdings: [],
  apiKey: "",
  editingTicker: null,
};

const holdingForm = document.querySelector("#holdingForm");
const tableBody = document.querySelector("#holdingsTableBody");
const rowTemplate = document.querySelector("#rowTemplate");
const statusEl = document.querySelector("#status");
const refreshBtn = document.querySelector("#refreshBtn");
const apiKeyInput = document.querySelector("#apiKey");
const saveApiKeyBtn = document.querySelector("#saveApiKeyBtn");
const saveHoldingBtn = document.querySelector("#saveHoldingBtn");
const cancelEditBtn = document.querySelector("#cancelEditBtn");

const holdingCountEl = document.querySelector("#holdingCount");
const portfolioValueEl = document.querySelector("#portfolioValue");
const averageDropEl = document.querySelector("#averageDrop");
const bestCandidateEl = document.querySelector("#bestCandidate");

function normalizeTicker(rawTicker) {
  return rawTicker.trim().toUpperCase();
}

function getPricingTicker(holding) {
  return normalizeTicker(holding.pricingTicker || PROXY_MAP[holding.ticker] || holding.ticker);
}

function getSignalTicker(holding) {
  return getPricingTicker(holding);
}

function getAverageCost(holding) {
  if (typeof holding.totalCostBasis === "number" && holding.shares > 0) {
    return holding.totalCostBasis / holding.shares;
  }

  if (typeof holding.costBasis === "number") {
    return holding.costBasis;
  }

  return null;
}

function formatCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.background = isError
    ? "rgba(162, 62, 51, 0.12)"
    : "rgba(21, 88, 69, 0.1)";
  statusEl.style.color = isError ? "#a23e33" : "#0f4334";
}

function resetForm() {
  holdingForm.reset();
  state.editingTicker = null;
  saveHoldingBtn.textContent = "Save holding";
  cancelEditBtn.classList.add("hidden");
}

function loadState() {
  try {
    state.holdings = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    state.holdings = [];
  }

  state.apiKey = localStorage.getItem(API_KEY_STORAGE) ?? "";
  apiKeyInput.value = state.apiKey;

  if (state.holdings.length === 0) {
    state.holdings = STARTER_HOLDINGS;
    saveHoldings();
  }
}

function saveHoldings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.holdings));
}

function saveApiKey() {
  state.apiKey = apiKeyInput.value.trim();
  localStorage.setItem(API_KEY_STORAGE, state.apiKey);
  setStatus(state.apiKey ? "API key saved." : "API key cleared.");
}

function getHoldingValue(holding) {
  return typeof holding.currentPrice === "number" ? holding.currentPrice * holding.shares : 0;
}

function getPortfolioValue() {
  return state.holdings.reduce((sum, holding) => sum + getHoldingValue(holding), 0);
}

function getPortfolioWeight(holding, portfolioValue) {
  if (!portfolioValue) {
    return null;
  }

  const value = getHoldingValue(holding);
  if (!value) {
    return null;
  }

  return (value / portfolioValue) * 100;
}

function buildScoredHolding(holding, portfolioValue) {
  const averageCost = getAverageCost(holding);
  const portfolioWeight = getPortfolioWeight(holding, portfolioValue);
  const targetAllocation =
    typeof holding.targetAllocation === "number" ? holding.targetAllocation : null;
  const weightGap =
    typeof targetAllocation === "number" && typeof portfolioWeight === "number"
      ? targetAllocation - portfolioWeight
      : null;

  const discountScore = clamp((holding.dropFromHigh ?? 0) * 2.2, 0, 50);
  const costGapPercent =
    typeof holding.currentPrice === "number" &&
    typeof averageCost === "number" &&
    averageCost > 0
      ? ((averageCost - holding.currentPrice) / averageCost) * 100
      : null;
  const costBasisScore =
    typeof costGapPercent === "number" ? clamp(costGapPercent * 2.2, 0, 25) : 0;
  const sizingScore =
    typeof weightGap === "number" ? clamp(weightGap * 3, 0, 25) : 0;
  const score = Math.round(discountScore + costBasisScore + sizingScore);

  let verdict = "Hold steady";
  let badgeClass = "pill pill-light";
  let reason = "Near target or not discounted enough yet.";

  if (score >= 70) {
    verdict = "Strong add";
    badgeClass = "pill pill-strong";
    reason = "Deeply off highs, below cost basis, and still under your target weight.";
  } else if (score >= 45) {
    verdict = "Possible add";
    badgeClass = "pill pill-maybe";
    reason = "Discount is meaningful, but one of the sizing or cost signals is weaker.";
  } else if ((holding.dropFromHigh ?? 0) >= 10) {
    verdict = "Watch closely";
    badgeClass = "pill pill-maybe";
    reason = "Off highs enough to monitor, but not compelling on all three signals yet.";
  }

  return {
    ...holding,
    portfolioWeight,
    targetAllocation,
    weightGap,
    averageCost,
    costGapPercent,
    score,
    verdict,
    badgeClass,
    reason,
  };
}

function getSortedScoredHoldings() {
  const portfolioValue = getPortfolioValue();
  return state.holdings
    .map((holding) => buildScoredHolding(holding, portfolioValue))
    .sort((a, b) => b.score - a.score || (b.dropFromHigh ?? 0) - (a.dropFromHigh ?? 0));
}

function addHolding(event) {
  event.preventDefault();

  const formData = new FormData(holdingForm);
  const ticker = normalizeTicker(String(formData.get("ticker") ?? ""));
  const shares = Number(formData.get("shares"));
  const totalCostBasisRaw = String(formData.get("totalCostBasis") ?? "").trim();
  const targetAllocationRaw = String(formData.get("targetAllocation") ?? "").trim();
  const pricingTicker = normalizeTicker(String(formData.get("pricingTicker") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim();

  const totalCostBasis = totalCostBasisRaw ? Number(totalCostBasisRaw) : null;
  const targetAllocation = targetAllocationRaw ? Number(targetAllocationRaw) : null;

  if (!ticker || !Number.isFinite(shares) || shares <= 0) {
    setStatus("Enter a valid ticker and share count.", true);
    return;
  }

  const existingIndex = state.editingTicker
    ? state.holdings.findIndex((holding) => holding.ticker === state.editingTicker)
    : state.holdings.findIndex((holding) => holding.ticker === ticker);
  const previous = existingIndex >= 0 ? state.holdings[existingIndex] : {};
  const nextHolding = {
    ...previous,
    ticker,
    pricingTicker,
    shares,
    totalCostBasis: Number.isFinite(totalCostBasis) ? totalCostBasis : null,
    costBasis: null,
    targetAllocation: Number.isFinite(targetAllocation) ? targetAllocation : null,
    notes,
  };

  if (existingIndex >= 0) {
    state.holdings[existingIndex] = nextHolding;
    setStatus(`Updated ${ticker}.`);
  } else {
    state.holdings.push({
      ...nextHolding,
      currentPrice: null,
      fiftyTwoWeekHigh: null,
      dropFromHigh: null,
      fetchedAt: null,
    });
    setStatus(`Added ${ticker}.`);
  }

  saveHoldings();
  resetForm();
  render();
}

function removeHolding(ticker) {
  state.holdings = state.holdings.filter((holding) => holding.ticker !== ticker);
  if (state.editingTicker === ticker) {
    resetForm();
  }
  saveHoldings();
  render();
  setStatus(`Removed ${ticker}.`);
}

function startEditing(ticker) {
  const holding = state.holdings.find((item) => item.ticker === ticker);
  if (!holding) {
    return;
  }

  state.editingTicker = ticker;
  holdingForm.elements.ticker.value = holding.ticker ?? "";
  holdingForm.elements.shares.value = holding.shares ?? "";
  holdingForm.elements.totalCostBasis.value =
    holding.totalCostBasis ??
    (typeof holding.costBasis === "number" && typeof holding.shares === "number"
      ? holding.costBasis * holding.shares
      : "");
  holdingForm.elements.targetAllocation.value = holding.targetAllocation ?? "";
  holdingForm.elements.pricingTicker.value = holding.pricingTicker ?? "";
  holdingForm.elements.notes.value = holding.notes ?? "";
  saveHoldingBtn.textContent = `Update ${ticker}`;
  cancelEditBtn.classList.remove("hidden");
  holdingForm.elements.ticker.focus();
}

function renderSummary(sortedHoldings) {
  const portfolioValue = getPortfolioValue();
  const withMarketData = sortedHoldings.filter(
    (holding) =>
      typeof holding.currentPrice === "number" &&
      typeof holding.dropFromHigh === "number",
  );
  const averageDrop =
    withMarketData.length > 0
      ? withMarketData.reduce((sum, holding) => sum + holding.dropFromHigh, 0) /
        withMarketData.length
      : 0;
  const topCandidate = sortedHoldings[0];

  holdingCountEl.textContent = String(state.holdings.length);
  portfolioValueEl.textContent = formatCurrency(portfolioValue);
  averageDropEl.textContent = formatPercent(averageDrop);
  bestCandidateEl.textContent = topCandidate
    ? `${topCandidate.ticker} (${topCandidate.score})`
    : "None yet";
}

function renderTable(sortedHoldings) {
  tableBody.innerHTML = "";

  sortedHoldings.forEach((holding) => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    const signalTicker = getSignalTicker(holding);
    const averageCost = getAverageCost(holding);
    const profitValue =
      typeof holding.currentPrice === "number" && typeof averageCost === "number"
        ? (holding.currentPrice - averageCost) * holding.shares
        : null;

    const holdingCell = row.querySelector('[data-cell="holding"]');
    holdingCell.innerHTML = `
      <div class="holding-main">
        <strong>${holding.ticker}</strong>
        ${holding.notes ? `<span class="holding-notes">${holding.notes}</span>` : ""}
      </div>
    `;

    row.querySelector('[data-cell="pricing"]').innerHTML =
      signalTicker === holding.ticker
        ? `<span class="mono">${signalTicker}</span>`
        : `<div class="holding-main"><strong class="mono">${signalTicker}</strong><span class="subtle">signal proxy</span></div>`;
    row.querySelector('[data-cell="shares"]').textContent = holding.shares.toLocaleString(
      "en-US",
      { maximumFractionDigits: 4 },
    );
    row.querySelector('[data-cell="current"]').textContent = formatCurrency(holding.currentPrice);
    row.querySelector('[data-cell="high"]').textContent = formatCurrency(
      holding.fiftyTwoWeekHigh,
    );

    const dropCell = row.querySelector('[data-cell="drop"]');
    dropCell.textContent =
      typeof holding.dropFromHigh === "number"
        ? `${formatPercent(holding.dropFromHigh)} below`
        : "-";
    if (typeof holding.dropFromHigh === "number") {
      dropCell.className = holding.dropFromHigh >= 15 ? "negative" : "";
    }

    row.querySelector('[data-cell="weight"]').textContent = formatPercent(
      holding.portfolioWeight,
    );
    row.querySelector('[data-cell="target"]').textContent = formatPercent(
      holding.targetAllocation,
    );
    row.querySelector('[data-cell="costBasis"]').innerHTML =
      typeof holding.totalCostBasis === "number" || typeof averageCost === "number"
        ? `<div class="holding-main"><strong>${formatCurrency(holding.totalCostBasis)}</strong><span class="subtle">${formatCurrency(averageCost)} avg</span></div>`
        : "-";

    const profitCell = row.querySelector('[data-cell="profit"]');
    profitCell.textContent = formatCurrency(profitValue);
    if (typeof profitValue === "number") {
      profitCell.className = profitValue >= 0 ? "positive" : "negative";
    }

    row.querySelector(
      '[data-cell="score"]',
    ).innerHTML = `<span class="score-badge">${holding.score}</span>`;
    row.querySelector('[data-cell="signal"]').innerHTML =
      `<span class="${holding.badgeClass}">${holding.verdict}</span>`;

    row.querySelector(".remove-btn").addEventListener("click", () => {
      removeHolding(holding.ticker);
    });
    row.querySelector(".edit-btn").addEventListener("click", () => {
      startEditing(holding.ticker);
    });

    tableBody.appendChild(row);
  });
}

function render() {
  const sortedHoldings = getSortedScoredHoldings();
  renderSummary(sortedHoldings);
  renderTable(sortedHoldings);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

function getOneYearUnixRange() {
  const now = new Date();
  const to = Math.floor(now.getTime() / 1000);
  const fromDate = new Date(now);
  fromDate.setFullYear(now.getFullYear() - 1);
  const from = Math.floor(fromDate.getTime() / 1000);
  return { from, to };
}

async function fetch52WeekHighFromCandles(ticker) {
  const token = encodeURIComponent(state.apiKey);
  const symbol = encodeURIComponent(ticker);
  const { from, to } = getOneYearUnixRange();
  const candles = await fetchJson(
    `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${token}`,
  );

  if (candles?.s !== "ok" || !Array.isArray(candles?.h) || candles.h.length === 0) {
    throw new Error(`No 1-year candle data for ${ticker}`);
  }

  const high = Math.max(...candles.h.map(Number).filter(Number.isFinite));
  if (!Number.isFinite(high)) {
    throw new Error(`Could not calculate 52-week high for ${ticker}`);
  }

  return high;
}

async function fetchCurrentQuote(ticker) {
  const symbol = encodeURIComponent(ticker);
  const token = encodeURIComponent(state.apiKey);
  const quote = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`,
  );
  const currentPrice = Number(quote.c);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(`No current quote for ${ticker}`);
  }

  return currentPrice;
}

async function fetchHoldingMarketData(holding) {
  const signalTicker = getSignalTicker(holding);
  const usesProxy = signalTicker !== holding.ticker;
  const symbol = encodeURIComponent(signalTicker);
  const token = encodeURIComponent(state.apiKey);
  let currentPrice = null;

  if (usesProxy) {
    try {
      currentPrice = await fetchCurrentQuote(holding.ticker);
    } catch (error) {
      console.warn(`Direct quote unavailable for ${holding.ticker}:`, error);
    }
  } else {
    currentPrice = await fetchCurrentQuote(signalTicker);
  }

  const signalQuote = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`,
  );
  const signalCurrentPrice = Number(signalQuote.c);

  if (!Number.isFinite(signalCurrentPrice) || signalCurrentPrice <= 0) {
    throw new Error(`No current quote for ${signalTicker}`);
  }

  let fiftyTwoWeekHigh = null;

  try {
    const metrics = await fetchJson(
      `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${token}`,
    );
    fiftyTwoWeekHigh = Number(metrics?.metric?.["52WeekHigh"]);
  } catch (error) {
    console.warn(`Metric endpoint failed for ${signalTicker}:`, error);
  }

  if (!Number.isFinite(fiftyTwoWeekHigh) || fiftyTwoWeekHigh <= 0) {
    fiftyTwoWeekHigh = await fetch52WeekHighFromCandles(signalTicker);
  }

  const dropFromHigh = ((fiftyTwoWeekHigh - signalCurrentPrice) / fiftyTwoWeekHigh) * 100;

  return {
    currentPrice,
    fiftyTwoWeekHigh,
    dropFromHigh,
    signalCurrentPrice,
    fetchedAt: new Date().toISOString(),
  };
}

async function refreshMarketData() {
  if (!state.apiKey) {
    setStatus("Add your Finnhub API key first.", true);
    return;
  }

  if (state.holdings.length === 0) {
    setStatus("Add at least one holding before refreshing.", true);
    return;
  }

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  setStatus("Pulling live market data...");

  try {
    const results = await Promise.allSettled(
      state.holdings.map(async (holding) => ({
        ticker: holding.ticker,
        data: await fetchHoldingMarketData(holding),
      })),
    );

    const successes = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason?.message ?? result.reason));

    state.holdings = state.holdings.map((holding) => {
      const match = successes.find((update) => update.ticker === holding.ticker);
      return match ? { ...holding, ...match.data } : holding;
    });

    saveHoldings();
    render();

    if (successes.length === 0) {
      throw new Error(failures[0] ?? "No holdings updated.");
    }

    if (failures.length > 0) {
      setStatus(
        `Updated ${successes.length} holding${successes.length === 1 ? "" : "s"}; failed: ${failures.join(" | ")}`,
        true,
      );
      return;
    }

    setStatus(
      `Updated ${successes.length} holding${successes.length === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    console.error(error);
    setStatus(`Could not load market data. ${String(error?.message ?? error)}`, true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh market data";
  }
}

holdingForm.addEventListener("submit", addHolding);
refreshBtn.addEventListener("click", refreshMarketData);
saveApiKeyBtn.addEventListener("click", saveApiKey);
cancelEditBtn.addEventListener("click", resetForm);

loadState();
render();

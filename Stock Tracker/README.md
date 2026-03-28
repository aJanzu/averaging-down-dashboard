# Averaging Down Dashboard

A polished static web app for tracking your stock holdings, monitoring how far each name sits below its 52-week high, and ranking potential "double dip" candidates with a more thoughtful scoring model.

## Why this project exists

Most simple portfolio trackers show prices. This project is built around a more specific investing workflow:

- keep a live view of the positions you already own
- see which holdings are meaningfully discounted from their 52-week highs
- compare current price to your average cost
- avoid blindly averaging down into positions that are already oversized

The result is a lightweight decision-support dashboard for evaluating whether a current holding deserves another buy.

## Features

- Live market data using the Finnhub API
- 52-week high tracking with a fallback candle-data calculation
- Local portfolio storage in the browser with no backend required
- Custom target allocation percentages per holding
- Average cost tracking for unrealized gain/loss context
- Weighted "Double Dip Score" based on:
  - discount from 52-week high
  - whether the position is below your average cost
  - whether the position is still under your target allocation
- Proxy ticker support for mutual funds and other hard-to-price holdings
  - example: `SWPPX` can be priced with `SPY`
- Ranked recommendations and portfolio summary cards
- Responsive UI designed for desktop and mobile

## Scoring model

The dashboard does not treat "far from the 52-week high" as enough by itself.

Each holding gets a score from three components:

1. Discount score
   Based on how far the current price sits below the 52-week high.

2. Cost basis score
   Rewards positions trading below your average cost basis.

3. Sizing score
   Rewards positions that are still below your target portfolio weight.

This produces a more realistic ranking than using only one metric.

## Tech stack

- HTML
- CSS
- Vanilla JavaScript
- Finnhub market data API
- Browser `localStorage`

## Running locally

This project has no build step.

1. Download or clone the repo.
2. Open `index.html` in your browser.
3. Create a free API key at [Finnhub](https://finnhub.io/register).
4. Paste the key into the app and click `Save`.
5. Add holdings and click `Refresh market data`.


## Deployment (GitHub Pages)

Push repo to GitHub
Go to Settings → Pages
Deploy from main branch
Open the generated URL

## Notes

- Do not commit your personal API key.
- Holdings and API keys are stored in your own browser via `localStorage`.
- This project is for personal research and workflow support, not financial advice.

## Project Summary
Built a client-side portfolio dashboard that integrates live market data, tracks 52-week-high discounts, and ranks buy opportunities using a weighted scoring model based on valuation, cost basis, and portfolio allocation.

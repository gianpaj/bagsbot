# ⚡ BAGSBOT

> **Snipe launches. Stack bags. Sleep later.**

The **fastest** Solana token sniper built on [Bags](https://bags.fm). Real-time detection. Multi-signal scoring. Semi-auto execution. Full position management.

---

## 🎯 WTF IS THIS?

BagsBot monitors new token launches on Bags **the instant they drop**, filters out the trash using a 4-layer scoring system, and lets you ape in with one keypress.

**No more missing 100x gems while you sleep.** No more buying rugs from anon devs.

---

## ⚔️ FEATURES

| Feature | What It Does |
|---------|--------------|
| 🔴 **Real-Time Detection** | Hooks directly into Bags Restream API. Zero delay. |
| 🧠 **Multi-Signal Filters** | Creator history, technicals, socials, liquidity - all checked |
| 📊 **Confidence Scoring** | 0-100 score tells you how likely it is to moon |
| ⚡ **One-Click Ape** | Review → Confirm → Transaction signed. That simple. |
| 💰 **Auto Position Sizing** | Calculates optimal buy based on your portfolio |
| 📈 **Exit Management** | Auto TP at 10x / SL at -50%. Set it and forget it. |
| 🖥️ **Sick Terminal UI** | Full TUI dashboard. See everything at a glance. |

---

## 🔥 THE FILTER STACK

```
Launch Detected
      ↓
┌─────────────────┐
│ CREATOR FILTER  │ → Verified? History? Rug record?
└─────────────────┘
      ↓
┌─────────────────┐
│ TECHNICAL FILTER│ → Token setup legit? Mint disabled?
└─────────────────┘
      ↓
┌─────────────────┐
│ SOCIAL FILTER   │ → Twitter linked? Real followers?
└─────────────────┘
      ↓
┌─────────────────┐
│ LIQUIDITY FILTER│ → Enough LP? No whale concentration?
└─────────────────┘
      ↓
   SCORE ≥ 60?
      ↓
  🚨 ALERT 🚨
```

---

## 🚀 QUICKSTART

### Prerequisites

- **Node.js** 18.0.0 or higher
- **Zig** (required for terminal UI rendering via OpenTUI)
  - Download from https://ziglang.org/download
  - Add to your PATH

### Installation

```bash
# Clone it
git clone https://github.com/gianpaj/bagsbot
cd bagsbot

# Install deps
pnpm install

# Configure
cp .env.example .env
# Add your BAGS_API_KEY, RPC URL, and wallet path

# Build
pnpm build

# Run
pnpm start
```

---

## ⌨️ KEYBINDINGS

| Key | Action |
|-----|--------|
| `Enter` | Confirm trade |
| `Esc` | Skip opportunity |
| `+/-` | Adjust position size |
| `P` | View positions |
| `Q` | Quit |

---

## ⚠️ DEGEN DISCLAIMER

This bot trades **real money**. New tokens are **high risk**. You can and probably will lose funds.

- Start small
- DYOR always
- Don't ape your rent

**NFA. You're responsible for your own bags.**

---

## 🛠️ TECH STACK

- TypeScript (strict mode, no `any` allowed)
- `@bagsfm/bags-sdk` - The official SDK
- `@solana/web3.js` - Blockchain interactions
- `@opentui/core` - Terminal UI
- Vitest - Testing

---

## 📜 LICENSE

MIT - Do whatever you want. Not financial advice.

---

**Built for degens, by degens.** 🎒

*Now go stack some bags.*

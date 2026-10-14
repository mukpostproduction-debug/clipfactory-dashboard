# ClipFactory Mission Control // Muk Post Production

> **Live Mobile PWA HUD**: [https://mukpostproduction-debug.github.io/clipfactory-dashboard/](https://mukpostproduction-debug.github.io/clipfactory-dashboard/)

Autonomous YouTube Shorts clipping engine, algorithmic A/B hook testing matrix, and real-time studio telemetry dashboard for **Muk Post Production** (Jackson McMurdo).

---

## 📱 Mobile Web App (iOS / Android Installation)

This dashboard is built as an installable **Progressive Web App (PWA)** featuring the official Muk Post logo and a native-feeling dark mode interface:

### On iPhone (Safari):
1. Open [`https://mukpostproduction-debug.github.io/clipfactory-dashboard/`](https://mukpostproduction-debug.github.io/clipfactory-dashboard/) in **Safari**.
2. Tap the **Share** button (the square with the arrow pointing up).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **"Add"** in the top right corner.
5. The **ClipFactory** app icon (with the official Muk Post logo) will appear on your Home Screen as a standalone, notch-safe fullscreen app.

### On Android (Chrome):
1. Open the URL in **Chrome**.
2. Tap the three dots menu in the top right.
3. Tap **"Install app"** or **"Add to Home screen"**.

---

## ⚡ Dual Hybrid Sync Architecture

1. **Live Cloudflare Tunnel Link**:
   - Zero-latency control when connected to your Mac Pro.
   - Allows 1-click A/B variant switching directly on live YouTube videos or scheduled slots.
   - 1-click Emergency Stop / Kill Switch.
   - 1-click view velocity audits.

2. **Automated GitHub State Push**:
   - The local supervisor daemon periodically commits and pushes `data/live_state.json` directly to this repository.
   - Your phone dashboard stays completely up to date anytime, anywhere, even when away from your desk.

---

## 🤖 Autonomous Agent Squadron

- **SCOUT**: Polls whitelisted podcast sources & RSS feeds.
- **STRATEGIST**: Identifies high-RPM moments and trending commercial niches.
- **EDITOR**: 1080x1920 30FPS vertical cuts with Whisper word-level pop captions.
- **COMMENTATOR**: Original compliance commentary voiceover.
- **PUBLISHER**: Multi-angle viral package generator (Variant A Curiosity, Variant B Contrarian, Variant C Protocol).
- **ANALYST**: Hourly view velocity telemetry and automated A/B title pivoting.
- **WATCHDOG**: Defcon 5 fair use & Content ID sentry.

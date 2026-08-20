<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🌞 Sunny (सन्नी)
### Live Conversational Voice Companion — Authentic Marathwada Marathi

</div>

Sunny is a real-time conversational AI companion and group facilitator designed for authentic Marathi interactions with Marathwada regional nuances.

---

## ✨ Features

- 🎙️ **Real-Time Bidirectional Voice**: Ultra-low latency voice streaming using Google Gemini Multimodal Live API.
- 👥 **Solo & Group Conversations**: Join 1-on-1 chats or collaborative group sessions with real-time audio broadcasting.
- 🧠 **Dynamic Memory & Insights**: Automatically tracks key relationship insights, notes, and preferences over time.
- 📋 **Progressive Onboarding & Profiles**: Collects user context naturally and maintains comprehensive user profiles.
- 🛠️ **Admin Studio**: Template management, conversation telemetry, and full data store administration.
- 🔐 **Google OAuth & Member Invitations**: Seamless login and email invitation support for group members.

---

## 🚀 Run Locally

### Prerequisites
- Node.js (v18+)
- npm or bun

### Setup Steps

1. **Clone the repository & install dependencies:**
   ```bash
   git clone https://github.com/RTadvalkar/neoarc-sunny.git
   cd neoarc-sunny
   npm install
   ```

2. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your Google Gemini API key and optional OAuth / SMTP credentials in `.env`:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   ```

3. **Start the application:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

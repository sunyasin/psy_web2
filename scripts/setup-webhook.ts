#!/usr/bin/env tsx
// setup-webhook.ts — Run: npx tsx scripts/setup-webhook.ts
// Sets up Telegram bot webhook for the app

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://yourdomain.com/api/telegram/webhook";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is not set in .env.local");
  process.exit(1);
}

async function setupWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`;
  console.log("Setting webhook to:", WEBHOOK_URL);

  const response = await fetch(url);
  const data = await response.json();

  if (data.ok) {
    console.log("✅ Webhook set up successfully!");
    console.log("Webhook URL:", data.result.url);
  } else {
    console.error("❌ Failed to set webhook:", data);
    process.exit(1);
  }
}

setupWebhook();

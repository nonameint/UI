#!/usr/bin/env bun
import { Bot } from 'grammy';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN not set"); process.exit(1); }

const STATE_DIR = join(homedir(), '.claude', 'channels', 'telegram');
const ACCESS_FILE = join(STATE_DIR, 'access.json');

function readAccess(): any {
  try { return JSON.parse(readFileSync(ACCESS_FILE, 'utf8')); }
  catch { return { dmPolicy: 'pairing', allowFrom: [], groups: {}, pending: {} }; }
}

function saveAccess(a: any) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(ACCESS_FILE, JSON.stringify(a, null, 2) + '\n');
}

const bot = new Bot(TOKEN);

bot.command('start', async ctx => {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply('This bot bridges Telegram to Claude Code.\n\nDM me anything to get a pairing code.');
});

bot.command('help', async ctx => {
  if (ctx.chat?.type !== 'private') return;
  await ctx.reply('Messages you send here route to a paired Claude Code session.\n\n/start - pairing instructions\n/status - check your pairing state');
});

bot.command('status', async ctx => {
  if (ctx.chat?.type !== 'private') return;
  const access = readAccess();
  const senderId = String(ctx.from!.id);
  if (access.allowFrom?.includes(senderId)) {
    const name = ctx.from!.username ? `@${ctx.from!.username}` : senderId;
    await ctx.reply(`Paired as ${name}.`);
  } else {
    await ctx.reply('Not paired. Send me a message to get a pairing code.');
  }
});

bot.on('message:text', async ctx => {
  if (ctx.chat?.type !== 'private') return;
  const access = readAccess();
  const senderId = String(ctx.from!.id);

  if (access.allowFrom?.includes(senderId)) {
    await ctx.reply('Message received. (Bot running in standalone mode — restart with --channels for full Claude Code bridge.)');
    return;
  }

  // Check existing pending
  for (const [code, p] of Object.entries(access.pending || {} as Record<string, any>)) {
    if ((p as any).senderId === senderId) {
      await ctx.reply('Still pending — run in Claude Code:\n\n/telegram:access pair ' + code);
      return;
    }
  }

  const code = randomBytes(3).toString('hex');
  const now = Date.now();
  if (!access.pending) access.pending = {};
  access.pending[code] = { senderId, chatId: String(ctx.chat.id), createdAt: now, expiresAt: now + 3600000, replies: 1 };
  saveAccess(access);

  console.error(`[BOT] Pairing code generated: ${code} for sender: ${senderId}`);
  await ctx.reply(`Pairing required — run in Claude Code:\n\n/telegram:access pair ${code}`);
});

bot.catch(err => console.error('[BOT] Handler error:', err));

console.error('[BOT] Starting...');
bot.start({
  onStart: info => console.error(`[BOT] Polling as @${info.username}`),
});

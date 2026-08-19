"use client";
import { createLocalStore } from "./storage";
import { INITIAL_BOT_STATE } from "./engine";
import type { ApiSettings, BotState } from "./types";

export const botStore = createLocalStore<BotState>("gmo-trader:bot:v1", INITIAL_BOT_STATE);

export const INITIAL_SETTINGS: ApiSettings = { apiKey: "", apiSecret: "", savedAt: null, liveTrading: false };
export const settingsStore = createLocalStore<ApiSettings>("gmo-trader:settings:v1", INITIAL_SETTINGS);

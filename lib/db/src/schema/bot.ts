import { pgTable, text, bigint, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";

export const botUsers = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  linkToken: text("link_token").notNull().unique(),
  coins: integer("coins").notNull().default(0),
  gender: text("gender"),
  referredBy: bigint("referred_by", { mode: "number" }),
  referralCoinAwarded: boolean("referral_coin_awarded").notNull().default(false),
  state: text("state").notNull().default("idle"),
  stateData: text("state_data"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const blockedUsers = pgTable("blocked_users", {
  id: serial("id").primaryKey(),
  blockerTelegramId: bigint("blocker_telegram_id", { mode: "number" }).notNull(),
  blockedToken: text("blocked_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const randomChats = pgTable("random_chats", {
  id: serial("id").primaryKey(),
  user1TelegramId: bigint("user1_telegram_id", { mode: "number" }).notNull(),
  user2TelegramId: bigint("user2_telegram_id", { mode: "number" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waitingQueue = pgTable("waiting_queue", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  genderPref: text("gender_pref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterTelegramId: bigint("reporter_telegram_id", { mode: "number" }).notNull(),
  reportedToken: text("reported_token").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BotUser = typeof botUsers.$inferSelect;

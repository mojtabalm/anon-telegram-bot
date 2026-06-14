import TelegramBot from "node-telegram-bot-api";
import { db, botUsers, blockedUsers, randomChats, waitingQueue, reports, botSettings } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID ?? "8426046895");
const ADMIN_USERNAME = "Abslnf";
const DEFAULT_CHANNELS = [
  { username: "lnterBots", url: "https://t.me/lnterBots" },
  { username: "lnterFreedom", url: "https://t.me/lnterFreedom" },
];
const REFERRAL_COINS = 20;
const GENDER_CHAT_COST = 2;

const WEBHOOK_URL = process.env.REPLIT_DOMAINS
  ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/api/bot/webhook`
  : null;

export const bot = new TelegramBot(token, { polling: !WEBHOOK_URL });

function generateToken(): string {
  return randomBytes(8).toString("hex");
}

async function getChannels(): Promise<{ username: string; url: string }[]> {
  try {
    const row = await db.select().from(botSettings).where(eq(botSettings.key, "channels")).limit(1);
    if (row.length > 0) return JSON.parse(row[0].value);
  } catch { /* fallback */ }
  return DEFAULT_CHANNELS;
}

async function getOrCreateUser(from: TelegramBot.User): Promise<typeof botUsers.$inferSelect> {
  const ex = await db.select().from(botUsers).where(eq(botUsers.telegramId, from.id)).limit(1);
  if (ex.length > 0) return ex[0];
  const linkToken = generateToken();
  const [u] = await db.insert(botUsers).values({
    telegramId: from.id,
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    linkToken,
  }).returning();
  return u;
}

async function freshUser(telegramId: number) {
  const r = await db.select().from(botUsers).where(eq(botUsers.telegramId, telegramId)).limit(1);
  return r[0] ?? null;
}

async function setUserState(telegramId: number, state: string, data?: string) {
  await db.update(botUsers).set({ state, stateData: data ?? null }).where(eq(botUsers.telegramId, telegramId));
}

async function getUserByToken(t: string) {
  const r = await db.select().from(botUsers).where(eq(botUsers.linkToken, t)).limit(1);
  return r[0] ?? null;
}

async function isAdmin(id: number, username?: string): Promise<boolean> {
  if (id === ADMIN_ID) return true;
  if (username && username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) return true;
  return false;
}

async function checkMembership(telegramId: number): Promise<boolean> {
  const channels = await getChannels();
  for (const ch of channels) {
    try {
      const m = await bot.getChatMember(`@${ch.username}`, telegramId);
      if (["left", "kicked"].includes(m.status)) return false;
    } catch { return false; }
  }
  return true;
}

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🪝 به یه ناشناس وصلم کن!" }],
        [{ text: "❤️ به مخاطب خاصم وصلم کن!" }],
        [{ text: "لینک ناشناس من 🖼" }, { text: "پیام ناشناس به گروه 👥" }],
        [{ text: "🏆 افزایش امتیاز" }, { text: "راهنما" }],
      ],
      resize_keyboard: true,
    },
  };
}

async function sendForceJoin(chatId: number) {
  const channels = await getChannels();
  const list = channels.map(c => `🔷 @${c.username}`).join("\n");
  const joinButtons = channels.map(c => [{ text: "🔗 عضویت", url: c.url }]);
  await bot.sendMessage(
    chatId,
    `ربات « ناشناس » کاملاً انحصاری فقط برای اعضای محترم کانال « زیر » طراحی شده ، برای استفاده از ربات ، در کانال زیر عضو شوید 👇\n\n${list}\n\nبعد از عضویت در کانال روی ✅ تایید عضویت بنزید 👇👇`,
    {
      reply_markup: {
        inline_keyboard: [
          ...joinButtons,
          [{ text: "✅ تایید عضویت", callback_data: "check_join" }],
        ],
      },
    }
  );
}

async function askGender(chatId: number) {
  await bot.sendMessage(chatId,
    "جنسیت خود را انتخاب کنید 👇",
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "👧 دختر", callback_data: "set_gender:female" },
          { text: "👦 پسر", callback_data: "set_gender:male" },
        ]],
      },
    }
  );
}

async function sendBanner(chatId: number, linkToken: string, coins: number) {
  const botInfo = await bot.getMe();
  const link = `https://t.me/${botInfo.username}?start=${linkToken}`;
  await bot.sendMessage(chatId,
    `سلام 👋 هستم!\n\nلینک زیر رو لمس کن و هر حرفی که نسبت به من داری یا با خیال راحت بنویس و بفرست. بدون اینکه باخبر بشم از اسمت باخبر بهم پیام به من میرسه. خودم میتونی امتحان کنی و از بقیه بخوای راحت و ناشناس پیام بهت بفرستن، حرفای جالبی میشنوی! 😉\n\n👇👇\n${link}`
  );
  await bot.sendMessage(chatId,
    `👌 پیام بالا رو به دوستات و گروه‌هایی که می‌شناسی فوروارد کن، یا با لینک داخلش به توئیت کن، تا بقیه بتونن بصورت ناشناس پیام بهت بفرستن. پیام‌ها از همین برنامه بهت میرسه.\n\nاینستاگرام داری و میخوای دنبال کننده‌های اینستاگرامت برات ناشناس پیام بفرستن؟\nلینک بالارو بیار بیوت پس ;)`
  );
  await bot.sendMessage(chatId,
    `اعتبار مکالمه شما : ${coins} سکه\n\nبرای افزایش اعتبار، بنر بالا رو به دوستات فوروارد کن.\nبه ازای هر کاربری که از طرف تو وارد برنامه بشه\n👈 ${REFERRAL_COINS} سکه جدید میگیری! 😁`,
    mainMenu()
  );
}

async function getActiveRandomChat(userId: number) {
  const c1 = await db.select().from(randomChats).where(and(eq(randomChats.isActive, true), eq(randomChats.user1TelegramId, userId))).limit(1);
  if (c1.length > 0) return c1[0];
  const c2 = await db.select().from(randomChats).where(and(eq(randomChats.isActive, true), eq(randomChats.user2TelegramId, userId))).limit(1);
  return c2[0] ?? null;
}

async function doBroadcast(adminChatId: number, text: string) {
  const all = await db.select().from(botUsers);
  let sent = 0, failed = 0;
  await bot.sendMessage(adminChatId, `⏳ در حال ارسال به ${all.length} کاربر...`);
  for (const u of all) {
    try { await bot.sendMessage(u.telegramId, `📢 *پیام از ادمین:*\n\n${text}`, { parse_mode: "Markdown" }); sent++; }
    catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await bot.sendMessage(adminChatId, `✅ ارسال تمام شد!\n✔️ موفق: ${sent}\n❌ ناموفق: ${failed}`);
}

// =================== /start ===================
bot.onText(/\/start(.*)/, async (msg, match) => {
  if (!msg.from) return;
  const param = match?.[1]?.trim() ?? "";
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg.from);

  if (param.length > 0) {
    const referrer = await getUserByToken(param);
    if (referrer && referrer.telegramId !== msg.from.id && !user.referredBy) {
      await db.update(botUsers).set({ referredBy: referrer.telegramId }).where(eq(botUsers.telegramId, msg.from.id));
      const isMem = await checkMembership(msg.from.id);
      if (isMem) {
        await db.update(botUsers).set({ coins: referrer.coins + REFERRAL_COINS }).where(eq(botUsers.telegramId, referrer.telegramId));
        try { await bot.sendMessage(referrer.telegramId, `🎉 یه نفر از طریق لینک دعوت تو وارد شد!\n🪙 ${REFERRAL_COINS} سکه به حسابت اضافه شد!`); } catch { /**/ }
      }
    }
  }

  const isMember = await checkMembership(msg.from.id);
  if (!isMember) { await sendForceJoin(chatId); return; }

  const u = await freshUser(msg.from.id);
  if (!u) return;

  if (!u.gender) { await askGender(chatId); return; }

  await bot.sendMessage(chatId, "ربات برای شما فعال شد.\n\nچه کاری برات انجام بدم؟", mainMenu());
});

// =================== /link & /banner ===================
bot.onText(/\/link/, async (msg) => {
  if (!msg.from) return;
  const u = await getOrCreateUser(msg.from);
  if (!await checkMembership(msg.from.id)) { await sendForceJoin(msg.chat.id); return; }
  if (!u.gender) { await askGender(msg.chat.id); return; }
  await sendBanner(msg.chat.id, u.linkToken, u.coins);
});

bot.onText(/\/banner/, async (msg) => {
  if (!msg.from) return;
  const u = await getOrCreateUser(msg.from);
  if (!await checkMembership(msg.from.id)) { await sendForceJoin(msg.chat.id); return; }
  if (!u.gender) { await askGender(msg.chat.id); return; }
  await sendBanner(msg.chat.id, u.linkToken, u.coins);
});

// =================== /admin ===================
bot.onText(/\/admin/, async (msg) => {
  if (!msg.from || !await isAdmin(msg.from.id, msg.from.username)) {
    await bot.sendMessage(msg.chat.id, "❌ دسترسی ندارید."); return;
  }
  const all = await db.select().from(botUsers);
  const channels = await getChannels();
  await bot.sendMessage(msg.chat.id,
    `⚙️ *پنل ادمین*\n\n👥 کاربران: *${all.length}*\n📢 کانال‌های جوین اجباری:\n${channels.map(c => `• @${c.username}`).join("\n")}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 پیام همگانی", callback_data: "admin_broadcast" }],
          [{ text: "➕ اضافه کردن کانال جوین اجباری", callback_data: "admin_add_channel" }],
          [{ text: "➖ حذف کانال جوین اجباری", callback_data: "admin_remove_channel" }],
          [{ text: "📊 آمار", callback_data: "admin_stats" }],
        ],
      },
    }
  );
});

// =================== /broadcast ===================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (!msg.from || !await isAdmin(msg.from.id, msg.from.username)) return;
  const text = match?.[1]; if (!text) return;
  await doBroadcast(msg.chat.id, text);
});

// =================== Main message handler ===================
bot.on("message", async (msg) => {
  if (!msg.from) return;
  if (msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text ?? "";
  const user = await getOrCreateUser(msg.from);
  const isMember = await checkMembership(userId);

  // ========== 🪝 وصل تصادفی ==========
  if (text === "🪝 به یه ناشناس وصلم کن!") {
    if (!isMember) { await sendForceJoin(chatId); return; }
    if (!user.gender) { await askGender(chatId); return; }
    const active = await getActiveRandomChat(userId);
    if (active) { await bot.sendMessage(chatId, "⚠️ الان در یه گفتگو هستی!\nبرای قطع کردن بنویس: قطع مکالمه"); return; }

    await setUserState(userId, "waiting_random_pref");
    await bot.sendMessage(chatId,
      "برات مهمه مخاطبیت پسر باشه یا دختر؟\nچت شانسی رایگان میباشد.",
      {
        reply_markup: {
          keyboard: [
            [{ text: "👦 پسر باشه" }, { text: "👧 دختر باشه" }],
            [{ text: "مهم نیست" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }

  // ========== انتخاب جنسیت چت تصادفی (keyboard) ==========
  if (["👦 پسر باشه", "👧 دختر باشه", "مهم نیست"].includes(text) && user.state === "waiting_random_pref") {
    let pref = "any";
    if (text === "👦 پسر باشه") pref = "male";
    else if (text === "👧 دختر باشه") pref = "female";

    const active = await getActiveRandomChat(userId);
    if (active) { await bot.sendMessage(chatId, "⚠️ الان در یه گفتگو هستی!"); return; }

    // بررسی سکه برای انتخاب جنسیت خاص
    if (pref !== "any") {
      const freshU = await freshUser(userId);
      if ((freshU?.coins ?? 0) < GENDER_CHAT_COST) {
        await setUserState(userId, "idle");
        await bot.sendMessage(chatId,
          `❌ سکه کافی نداری!\n\nبرای انتخاب جنسیت مخاطب نیاز به ${GENDER_CHAT_COST} سکه داری.\nسکه فعلی تو: ${freshU?.coins ?? 0} سکه\n\nبرای گرفتن سکه رایگان، بنرت رو به دوستات فوروارد کن 👇`,
          {
            reply_markup: {
              keyboard: [
                [{ text: "🏆 افزایش امتیاز" }],
                [{ text: "مهم نیست" }],
              ],
              resize_keyboard: true,
            },
          }
        );
        await setUserState(userId, "waiting_random_pref");
        return;
      }
      // کسر سکه
      await db.update(botUsers).set({ coins: (freshU?.coins ?? 0) - GENDER_CHAT_COST }).where(eq(botUsers.telegramId, userId));
    }

    const partner = await findPartner(userId, pref, user.gender ?? "any");

    if (partner) {
      await db.delete(waitingQueue).where(eq(waitingQueue.telegramId, partner.telegramId));
      await db.insert(randomChats).values({ user1TelegramId: userId, user2TelegramId: partner.telegramId });
      await setUserState(userId, "in_random_chat");
      await setUserState(partner.telegramId, "in_random_chat");
      const connMsg = "یافتم و وصلتون کردم 🤜 با مخاطبت ناشناسانه حرف بزن!";
      await bot.sendMessage(chatId, connMsg, {
        reply_markup: { keyboard: [[{ text: "قطع مکالمه" }]], resize_keyboard: true },
      });
      await bot.sendMessage(partner.telegramId, connMsg, {
        reply_markup: { keyboard: [[{ text: "قطع مکالمه" }]], resize_keyboard: true },
      });
    } else {
      const alreadyQ = await db.select().from(waitingQueue).where(eq(waitingQueue.telegramId, userId)).limit(1);
      if (alreadyQ.length === 0) {
        await db.insert(waitingQueue).values({ telegramId: userId, genderPref: pref });
      }
      await setUserState(userId, "waiting_random");
      await bot.sendMessage(chatId,
        "در حال اتصال...\nاگر تا حداکثر یک دقیقه آینده پیامی ارسال نشد دوباره تلاش کنید",
        { reply_markup: { keyboard: [[{ text: "بیخیال، انصراف میدم" }]], resize_keyboard: true } }
      );
    }
    return;
  }

  // ========== انصراف از صف انتظار ==========
  if (text === "بیخیال، انصراف میدم" || text === "انصراف") {
    await db.delete(waitingQueue).where(eq(waitingQueue.telegramId, userId));
    await setUserState(userId, "idle");
    await bot.sendMessage(chatId, "باشه! انصراف دادی. 👌", mainMenu());
    return;
  }

  // ========== ❤️ مخاطب خاص ==========
  if (text === "❤️ به مخاطب خاصم وصلم کن!") {
    if (!isMember) { await sendForceJoin(chatId); return; }
    if (!user.gender) { await askGender(chatId); return; }
    await setUserState(userId, "waiting_specific");
    await bot.sendMessage(chatId,
      "برای اینکه بتونم به مخاطب خاصت بطور ناشناس وصلت کنم، یکی از این 2 کار رو انجام بده:\n\nراه اول 👉 : @Username یا همون آیدی تلگرام اون شخص رو وارد ربات کن!\nراه دوم 👉 : الان یه پیام متنی از اون شخص به این ربات فوروارد کن تا ببینیم عضو ربات هست یا نه!"
    );
    return;
  }

  // ========== لینک ناشناس من ==========
  if (text === "لینک ناشناس من 🖼") {
    if (!isMember) { await sendForceJoin(chatId); return; }
    if (!user.gender) { await askGender(chatId); return; }
    await sendBanner(chatId, user.linkToken, user.coins);
    return;
  }

  // ========== پیام به گروه ==========
  if (text === "پیام ناشناس به گروه 👥") {
    if (!isMember) { await sendForceJoin(chatId); return; }
    await bot.sendMessage(chatId, "بزودی... 🔜", mainMenu());
    return;
  }

  // ========== 🏆 افزایش امتیاز ==========
  if (text === "🏆 افزایش امتیاز") {
    if (!isMember) { await sendForceJoin(chatId); return; }
    const u = await freshUser(userId);
    const botInfo = await bot.getMe();
    const link = `https://t.me/${botInfo.username}?start=${u?.linkToken}`;
    await bot.sendMessage(chatId,
      `اعتبار فعلی مکالمه شما : ${u?.coins ?? 0} سکه\n\n❓ چطور اعتبار خودمو افزایش بدم ؟\n_____________________\n\n1️⃣ روش اول (رایگان) :\n\nبرای افزایش اعتبار بنر مخصوص خودت رو به دوستات فوروارد کن. به ازای هر کاربری که از طرف تو وارد برنامه بشه ${REFERRAL_COINS} سکه جدید میگیری! 😁\nبرای دریافت بنر 👈 /banner رو لمس کن\n\n🔗 لینک دعوت مستقیم:\n${link}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "📤 اشتراک‌گذاری لینک", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("با این ربات ناشناس باهام چت کن! 🎭")}` },
          ]],
        },
      }
    );
    return;
  }

  // ========== راهنما ==========
  if (text === "راهنما") {
    await bot.sendMessage(chatId,
      "راهنما 🔍\n\nمن از اینجام که کمکت کنم! 😁\nبرای دریافت راهنمایی در مورد هر موضوع، کافیه دکمه شیشه‌ای موردنظر رو لمس کنی 👇",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "👉 این ربات چیه؟ و به چه درد میخوره؟", callback_data: "help_about" }],
            [{ text: "👉 چطوری پیام ناشناس دریافت کنم؟", callback_data: "help_receive" }],
            [{ text: "👉 چطوری به مخاطب خاصم وصل بشم؟", callback_data: "help_specific" }],
            [{ text: "👉 چطوری به یه ناشناس تصادفی وصل شیم؟", callback_data: "help_random" }],
          ],
        },
      }
    );
    return;
  }

  // ========== قطع مکالمه ==========
  if (text === "قطع مکالمه") {
    const active = await getActiveRandomChat(userId);
    if (active) {
      await setUserState(userId, "confirm_end_chat", String(active.id));
      await bot.sendMessage(chatId, "پیام سیستم:\nمطمئنی میخوای این گپ رو ببندی؟",
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "آره گپ رو قطع کن", callback_data: "end_chat_yes" },
              { text: "نه", callback_data: "end_chat_no" },
            ]],
          },
        }
      );
    } else {
      await db.delete(waitingQueue).where(eq(waitingQueue.telegramId, userId));
      await setUserState(userId, "idle");
      await bot.sendMessage(chatId, "در گفتگویی نیستی.", mainMenu());
    }
    return;
  }

  // ========== مسدودسازی از طریق keyboard ==========
  if (text === "آره بلاکش کن" && user.state === "ask_block") {
    await setUserState(userId, "ask_block_reason", user.stateData ?? "");
    await bot.sendMessage(chatId, "پیام سیستم:\nچرا میخوای بلاکش کنی؟",
      {
        reply_markup: {
          keyboard: [
            [{ text: "بی ادب بود" }, { text: "جنسیتش اشتباه بود" }],
            [{ text: "باهاش حال نکردم" }, { text: "تبلیغ فرستاد" }],
            [{ text: "بیخیال، بعدا هم وصل شم" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }

  if (text === "بیخیال، بعدا هم وصل شم" && (user.state === "ask_block" || user.state === "ask_block_reason")) {
    await setUserState(userId, "idle");
    await bot.sendMessage(chatId, "حله! 👌\nچه کاری برات انجام بدم؟", mainMenu());
    return;
  }

  // ========== دلیل بلاک از keyboard ==========
  if (["بی ادب بود", "جنسیتش اشتباه بود", "باهاش حال نکردم", "تبلیغ فرستاد"].includes(text) && user.state === "ask_block_reason") {
    const stateData = user.stateData ?? "";
    const [blockToken, partnerIdStr] = stateData.split(":");
    const reportedId = parseInt(partnerIdStr ?? "0");
    const reason = text;

    if (blockToken) {
      await db.insert(blockedUsers).values({ blockerTelegramId: userId, blockedToken: blockToken }).onConflictDoNothing();
    }
    if (reportedId) {
      await db.insert(reports).values({ reporterTelegramId: userId, reportedToken: blockToken, reason });
      try {
        await bot.sendMessage(reportedId,
          `⚠️ *اطلاعیه سیستم:*\nشما توسط یکی از کاربران گزارش شدید.\n📌 دلیل: *${reason}*\n\nلطفاً رعایت قوانین را بکنید.`,
          { parse_mode: "Markdown" }
        );
      } catch { /**/ }
    }

    await setUserState(userId, "idle");
    await bot.sendMessage(chatId, "حله!\nچه کاری برات انجام بدم؟", mainMenu());
    return;
  }

  // ========== دلیل گزارش از keyboard ==========
  if (["بی ادب بود", "تبلیغ فرستاد", "انصراف"].includes(text) && user.state === "report_reason") {
    const stateData = user.stateData ?? "";
    const [reportedToken] = stateData.split(":");
    await setUserState(userId, "idle");
    if (text === "انصراف") {
      await bot.sendMessage(chatId, "باشه! 👌", mainMenu());
      return;
    }
    const reason = text;
    const reportedUser = await getUserByToken(reportedToken);
    await db.insert(reports).values({ reporterTelegramId: userId, reportedToken, reason });
    if (reportedUser) {
      try {
        await bot.sendMessage(reportedUser.telegramId,
          `⚠️ *اطلاعیه سیستم:*\nشما توسط یکی از کاربران گزارش شدید.\n📌 دلیل: *${reason}*`,
          { parse_mode: "Markdown" }
        );
      } catch { /**/ }
    }
    await bot.sendMessage(chatId, "✅ گزارش ثبت شد.", mainMenu());
    return;
  }

  // ========== پیام در چت تصادفی ==========
  const active = await getActiveRandomChat(userId);
  if (active) {
    const partnerId = active.user1TelegramId === userId ? active.user2TelegramId : active.user1TelegramId;
    if (msg.sticker) await bot.sendSticker(partnerId, msg.sticker.file_id);
    else if (msg.photo) await bot.sendPhoto(partnerId, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption });
    else if (msg.voice) await bot.sendVoice(partnerId, msg.voice.file_id);
    else if (msg.video) await bot.sendVideo(partnerId, msg.video.file_id, { caption: msg.caption });
    else if (msg.animation) await bot.sendAnimation(partnerId, msg.animation.file_id);
    else if (msg.document) await bot.sendDocument(partnerId, msg.document.file_id);
    else if (text) await bot.sendMessage(partnerId, text);
    return;
  }

  // ========== waiting_specific ==========
  if (user.state === "waiting_specific") {
    if (msg.forward_from) {
      const target = await db.select().from(botUsers).where(eq(botUsers.telegramId, msg.forward_from.id)).limit(1);
      if (target.length > 0) {
        await setUserState(userId, "pending_anon_msg", String(target[0].telegramId));
        await bot.sendMessage(chatId, "✅ مخاطب پیدا شد! پیام ناشناس خود را بنویسید:");
      } else {
        await bot.sendMessage(chatId, "❌ این کاربر هنوز عضو ربات نیست.");
        await setUserState(userId, "idle");
      }
      return;
    }
    if (text) {
      const mention = text.match(/^@(\w+)$/);
      if (mention) {
        const target = await db.select().from(botUsers).where(eq(botUsers.username, mention[1])).limit(1);
        if (target.length > 0) {
          await setUserState(userId, "pending_anon_msg", String(target[0].telegramId));
          await bot.sendMessage(chatId, "✅ مخاطب پیدا شد! پیام ناشناس خود را بنویسید:");
        } else {
          await bot.sendMessage(chatId, "❌ این کاربر هنوز عضو ربات نیست.");
          await setUserState(userId, "idle");
        }
        return;
      }
      await bot.sendMessage(chatId, "لطفاً @Username مخاطب را بنویسید یا یه پیام از ایشون فوروارد کنید.");
    }
    return;
  }

  // ========== pending_anon_msg ==========
  if (user.state === "pending_anon_msg" && user.stateData && text) {
    const recipientId = parseInt(user.stateData);
    const blocked = await db.select().from(blockedUsers).where(
      and(eq(blockedUsers.blockerTelegramId, recipientId), eq(blockedUsers.blockedToken, user.linkToken))
    ).limit(1);
    if (blocked.length > 0) {
      await bot.sendMessage(chatId, "❌ این کاربر شما را مسدود کرده است.");
      await setUserState(userId, "idle");
      return;
    }
    await bot.sendMessage(recipientId,
      `📩 *پیام ناشناس جدید:*\n\n${text}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "↩️ پاسخ ناشناس", callback_data: `reply:${userId}` },
            { text: "🚫 بلاک", callback_data: `block:${user.linkToken}` },
          ]],
        },
      }
    );
    await setUserState(userId, "idle");
    await bot.sendMessage(chatId, "✅ پیام ناشناس شما ارسال شد!", mainMenu());
    return;
  }

  // ========== admin states ==========
  if (await isAdmin(userId, msg.from.username)) {
    if (user.state === "admin_broadcast" && text) {
      await setUserState(userId, "idle");
      await doBroadcast(chatId, text);
      return;
    }
    if (user.state === "admin_add_channel" && text) {
      const raw = text.replace("@", "").trim();
      const channels = await getChannels();
      if (!channels.find(c => c.username === raw)) {
        channels.push({ username: raw, url: `https://t.me/${raw}` });
        await db.insert(botSettings).values({ key: "channels", value: JSON.stringify(channels) })
          .onConflictDoUpdate({ target: botSettings.key, set: { value: JSON.stringify(channels), updatedAt: new Date() } });
      }
      await setUserState(userId, "idle");
      await bot.sendMessage(chatId, `✅ کانال @${raw} اضافه شد.\nکانال‌های فعال:\n${channels.map(c => `• @${c.username}`).join("\n")}`);
      return;
    }
    if (user.state === "admin_remove_channel" && text) {
      const raw = text.replace("@", "").trim();
      let channels = await getChannels();
      channels = channels.filter(c => c.username !== raw);
      await db.insert(botSettings).values({ key: "channels", value: JSON.stringify(channels) })
        .onConflictDoUpdate({ target: botSettings.key, set: { value: JSON.stringify(channels), updatedAt: new Date() } });
      await setUserState(userId, "idle");
      await bot.sendMessage(chatId, `✅ کانال @${raw} حذف شد.\nکانال‌های فعال:\n${channels.map(c => `• @${c.username}`).join("\n")}`);
      return;
    }
  }

  if (text) {
    await bot.sendMessage(chatId, "حله!\nچه کاری برات انجام بدم؟", mainMenu());
  }
});

// =================== Find partner helper ===================
async function findPartner(userId: number, pref: string, userGender: string) {
  if (pref === "any") {
    const r = await db.select().from(waitingQueue).where(ne(waitingQueue.telegramId, userId)).limit(1);
    return r[0] ?? null;
  }
  const queueItems = await db.select().from(waitingQueue).where(ne(waitingQueue.telegramId, userId));
  for (const qi of queueItems) {
    const qUser = await freshUser(qi.telegramId);
    if (qUser && qUser.gender === pref && (qi.genderPref === "any" || qi.genderPref === userGender)) {
      return qi;
    }
  }
  return null;
}

// =================== Callbacks ===================
bot.on("callback_query", async (query) => {
  if (!query.data || !query.from) return;
  const chatId = query.message!.chat.id;
  const userId = query.from.id;
  await bot.answerCallbackQuery(query.id);

  // ===== تایید عضویت =====
  if (query.data === "check_join") {
    const isMember = await checkMembership(userId);
    if (isMember) {
      let u = await freshUser(userId);
      if (!u) { u = await getOrCreateUser(query.from); }

      // اگر از طریق لینک دعوت آمده و هنوز سکه داده نشده، سکه بده
      if (u.referredBy && !u.referralCoinAwarded) {
        const referrer = await freshUser(u.referredBy);
        if (referrer) {
          await db.update(botUsers)
            .set({ coins: referrer.coins + REFERRAL_COINS })
            .where(eq(botUsers.telegramId, referrer.telegramId));
          await db.update(botUsers)
            .set({ referralCoinAwarded: true })
            .where(eq(botUsers.telegramId, userId));
          try {
            await bot.sendMessage(referrer.telegramId,
              `🎉 یه نفر از طریق لینک دعوت تو وارد شد!\n🪙 ${REFERRAL_COINS} سکه به حسابت اضافه شد!`
            );
          } catch { /**/ }
        }
      }

      if (!u.gender) { await askGender(chatId); }
      else { await bot.sendMessage(chatId, "ربات برای شما فعال شد.\n\nچه کاری برات انجام بدم؟", mainMenu()); }
    } else {
      await bot.answerCallbackQuery(query.id, { text: "❌ هنوز عضو نشدی! اول عضو کانال شو 👇", show_alert: true });
      await sendForceJoin(chatId);
    }
    return;
  }

  // ===== انتخاب جنسیت اولیه =====
  if (query.data.startsWith("set_gender:")) {
    const gender = query.data.split(":")[1];
    await db.update(botUsers).set({ gender }).where(eq(botUsers.telegramId, userId));
    const label = gender === "female" ? "👧 دختر" : "👦 پسر";
    await bot.sendMessage(chatId, `✅ جنسیت شما ${label} ثبت شد!`);
    const u = await freshUser(userId);
    if (u) await bot.sendMessage(chatId, "ربات برای شما فعال شد.\n\nچه کاری برات انجام بدم؟", mainMenu());
    return;
  }

  // ===== قطع گپ تأیید =====
  if (query.data === "end_chat_yes") {
    const active = await getActiveRandomChat(userId);
    if (active) {
      const partnerId = active.user1TelegramId === userId ? active.user2TelegramId : active.user1TelegramId;
      const partnerUser = await freshUser(partnerId);
      await db.update(randomChats).set({ isActive: false }).where(eq(randomChats.id, active.id));
      await setUserState(userId, "ask_block", `${partnerUser?.linkToken ?? ""}:${partnerId}`);
      await setUserState(partnerId, "idle");

      await bot.sendMessage(chatId,
        "پیام سیستم:\nاین گپ بسته شد! نیاز داری این مخاطب رو بلاک کنم که دیگه بهت متصل نشه؟",
        {
          reply_markup: {
            keyboard: [
              [{ text: "آره بلاکش کن" }, { text: "بیخیال، بعدا هم وصل شم" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );

      try {
        await bot.sendMessage(partnerId,
          "🔴 طرف مقابل گفتگو را قطع کرد.",
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "🚨 گزارش", callback_data: `report_ask:${(await freshUser(userId))?.linkToken ?? ""}:${userId}` },
              ]],
            },
          }
        );
      } catch { /**/ }
    }
    return;
  }

  if (query.data === "end_chat_no") {
    await setUserState(userId, "in_random_chat");
    await bot.sendMessage(chatId, "✅ گفتگو ادامه دارد.",
      { reply_markup: { keyboard: [[{ text: "قطع مکالمه" }]], resize_keyboard: true } }
    );
    return;
  }

  // ===== گزارش از طرف کسی که چت قطع شد =====
  if (query.data.startsWith("report_ask:")) {
    const parts = query.data.split(":");
    const blockToken = parts[1];
    const reportedId = parseInt(parts[2] ?? "0");
    await setUserState(userId, "report_reason", `${blockToken}:${reportedId}`);
    await bot.sendMessage(chatId, "🚨 دلیل گزارش را انتخاب کنید:",
      {
        reply_markup: {
          keyboard: [
            [{ text: "بی ادب بود" }, { text: "تبلیغ فرستاد" }],
            [{ text: "انصراف" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }

  // ===== پاسخ ناشناس =====
  if (query.data.startsWith("reply:")) {
    const targetId = parseInt(query.data.split(":")[1]);
    await setUserState(userId, "pending_anon_msg", String(targetId));
    await bot.sendMessage(chatId, "✉️ پیام پاسخ ناشناس خود را بنویسید:");
    return;
  }

  // ===== بلاک پیام ناشناس =====
  if (query.data.startsWith("block:")) {
    const blockToken = query.data.split(":")[1];
    await db.insert(blockedUsers).values({ blockerTelegramId: userId, blockedToken: blockToken }).onConflictDoNothing();
    await bot.sendMessage(chatId, "🚫 این کاربر مسدود شد.");
    return;
  }

  // ===== پنل ادمین =====
  if (query.data === "admin_broadcast" && await isAdmin(userId, query.from.username)) {
    await setUserState(userId, "admin_broadcast");
    await bot.sendMessage(chatId, "📢 پیام همگانی خود را بنویسید:");
    return;
  }

  if (query.data === "admin_add_channel" && await isAdmin(userId, query.from.username)) {
    await setUserState(userId, "admin_add_channel");
    await bot.sendMessage(chatId, "📢 آیدی کانال جدید را بنویسید (مثلاً @mychannel یا mychannel):");
    return;
  }

  if (query.data === "admin_remove_channel" && await isAdmin(userId, query.from.username)) {
    const channels = await getChannels();
    await setUserState(userId, "admin_remove_channel");
    await bot.sendMessage(chatId,
      `کانال‌های فعال:\n${channels.map(c => `• @${c.username}`).join("\n")}\n\nآیدی کانالی که میخوای حذف بشه رو بنویس:`
    );
    return;
  }

  if (query.data === "admin_stats" && await isAdmin(userId, query.from.username)) {
    const all = await db.select().from(botUsers);
    const totalReports = await db.select().from(reports);
    const channels = await getChannels();
    await bot.sendMessage(chatId,
      `📊 *آمار ربات*\n\n👥 کل کاربران: *${all.length}*\n🚨 گزارش‌ها: *${totalReports.length}*\n📢 کانال‌های جوین اجباری:\n${channels.map(c => `• @${c.username}`).join("\n")}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ===== راهنما =====
  const helpBack = {
    reply_markup: {
      inline_keyboard: [[{ text: "بازگشت به صفحه راهنما", callback_data: "help_back" }]],
    },
  };

  if (query.data === "help_about") {
    await bot.sendMessage(chatId,
      "👉 این ربات چیه؟ و به چه درد میخوره؟\n\n» برنامه ناشناس « محبوب‌ترین و کامل‌ترین ربات تلگرام 💙\n\n🔹 هر وقت حوصلت سر رفت بصورت تصادفی به یک نفر وصل بشی و باهاش ناشناس گپ بزنی!\n\n🔹 میتونی به دوستات اجازه بدی هر حرف یا انتقادی که تو دلشون مونده رو بصورت ناشناس بهت بگن!\n\n🔹 میتونی به گروه‌هایی که توشون هستی پیام ناشناس بفرستی!\n\n🔹 جذاب‌ترین: میتونی به مخاطب خاصت بصورت ناشناس پیام بفرستی 👌",
      helpBack
    );
    return;
  }

  if (query.data === "help_receive") {
    await bot.sendMessage(chatId,
      "👉 چطوری پیام ناشناس دریافت کنم؟\n\nبرای دریافت پیام ناشناس کافیه دستور 👈 /link رو لمس کنی تا لینک اختصاصیت برات ارسال بشه. با فرستادن این لینک به دوستات و گروه‌ها یا با گذاشتن آن در شبکه‌های اجتماعی مثل فیسبوک و توئیت، میتونن تو دلشونه رو به صورت ناشناس بهت بزنن. یک متن پیشفرض همراه لینک بهت فرستاده میشه، البته میتونی به دلخواه خودت هم تغییرش بدی!",
      helpBack
    );
    return;
  }

  if (query.data === "help_specific") {
    await bot.sendMessage(chatId,
      "👉 چطوری به مخاطب خاصم وصل بشم؟\n\nبرای اینکه بتونی به مخاطب خاصت بطور ناشناس وصل بشی باید یکی از این 2 کار رو انجام بده:\n\nراه اول 👉 : @Username یا همون آیدی تلگرام اون شخص رو وارد ربات کن!\nراه دوم 👉 : الان یه پیام متنی از اون شخص به این ربات فوروارد کن تا ببینیم عضو برنامه هست یا نه! و خیلی راحت بهشون پیام بفرستی و حرف دلتو بگی! 😎",
      helpBack
    );
    return;
  }

  if (query.data === "help_random") {
    await bot.sendMessage(chatId,
      "👉 چطوری به یه ناشناس تصادفی وصل شیم؟\n\nبرای اینکار کافیه روی دکمه « ناشناس تصادفی » کلیک کنی تا بصورت شانسی به یه نفر وصل بشی و باهاش گپ بزنی!",
      helpBack
    );
    return;
  }

  if (query.data === "help_back") {
    await bot.sendMessage(chatId,
      "راهنما 🔍\n\nمن از اینجام که کمکت کنم! 😁\nبرای دریافت راهنمایی در مورد هر موضوع، کافیه دکمه شیشه‌ای موردنظر رو لمس کنی 👇",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "👉 این ربات چیه؟ و به چه درد میخوره؟", callback_data: "help_about" }],
            [{ text: "👉 چطوری پیام ناشناس دریافت کنم؟", callback_data: "help_receive" }],
            [{ text: "👉 چطوری به مخاطب خاصم وصل بشم؟", callback_data: "help_specific" }],
            [{ text: "👉 چطوری به یه ناشناس تصادفی وصل شیم؟", callback_data: "help_random" }],
          ],
        },
      }
    );
    return;
  }
});

// =================== Webhook Setup ===================
export async function setupWebhook() {
  if (!WEBHOOK_URL) {
    logger.info("Running in polling mode (no REPLIT_DOMAINS)");
    return;
  }
  try {
    await bot.setWebHook(WEBHOOK_URL);
    logger.info({ url: WEBHOOK_URL }, "Webhook set");
  } catch (err) {
    logger.error({ err }, "Failed to set webhook");
  }
}

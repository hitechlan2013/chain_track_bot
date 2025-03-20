import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();


//bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not found in environment variables");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

interface UserState {
  awaiting?: "pnl_wallet" | "price_symbol";
}

const userStates: Record<number, UserState> = {};
let coinListCache: any[] = [];

// ============================ BOT COMMANDS =================================

bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "pnl", description: "Get PNL report for a wallet" },
  { command: "price", description: "Get price info for a coin" },
  { command: "top10", description: "Show top 10 coins info" },
  { command: "trending", description: "Show trending coins" },
  { command: "help", description: "Help info" },
]);


bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeMessage = `
🎉 *Welcome to* *Crypto Info Bot*! 🎉

Your *ultimate* 🔥 crypto companion for tracking *real-time* 📡 data, analyzing 📊 wallet PNL, and exploring the hottest coins! 🚀

✨ *What I can do for you:*
━━━━━━━━━━━━━━━━━━━━━━━
💼 Track your *Wallet PNL* (Multi-Chain)
💰 Get *Live Coin Prices* instantly
🏆 Show *Top 10 Coins* by Market Cap
🚀 Discover *Trending 10 Tokens* right now
📊 Provide *Market Insights* at a glance
━━━━━━━━━━━━━━━━━━━━━━━

🛠 *More features coming soon... Stay tuned!*
  `;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🏆 Top 10 Coins", callback_data: "top10" },
          { text: "🚀 Trending Tokens", callback_data: "trending" },
        ],
        [
          { text: "💼 Wallet PNL", callback_data: "ask_wallet_pnl" },
          { text: "💰 Get Coin Price", callback_data: "ask_symbol_price" },
        ],
        [{ text: "❓ Help", callback_data: "help" }],
      ],
    },
  });

  // Notify YOU (the owner)
  const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID!;
  if (!msg.from) {
    console.error('Message "from" field is undefined.');
    return;
  }

  const userId = msg.from.id;
  const firstName = msg.from.first_name || "";
  const lastName = msg.from.last_name || "";
  const username = msg.from.username ? `@${msg.from.username}` : "No username";

  const ownerMessage = `
👤 *New User Started the Bot!*

🆔 *ID:* ${userId}
👨‍💻 *Name:* ${firstName} ${lastName}
💬 *Username:* ${username}
📅 *Time:* ${new Date().toLocaleString()}
  `;

  bot.sendMessage(OWNER_CHAT_ID, ownerMessage, { parse_mode: "Markdown" });
});

function sendHelpMessage(chatId: number) {
  const helpMessage = `
  🤖 *Welcome to the Crypto Bot Help Center!*
  
  Here’s what I can do for you:
  ━━━━━━━━━━━━━━━━━━━━
  📊 *Top 10 Coins*
  Get the current Top 10 cryptocurrencies by market cap._
  ➡️ Tap the *Top 10* button.
  
  🚀 *Trending Coins*
  Discover which coins are trending right now._
  ➡️ Tap the *Trending* button.
  
  💼 *Wallet PNL*
  Calculate your wallet Profit & Loss across multiple chains._
  ➡️ Tap *Wallet PNL* and send me your wallet address.
  
  💰 *Price Info*
  Check real-time prices for any crypto symbol (e.g., BTC)._
  ➡️ Tap *Price Info* and send me the symbol.
  
  🆘 *Help*
  View this help menu anytime by tapping *Help*.
  ━━━━━━━━━━━━━━━━━━━━
  
  👨‍💻 *Developer Contact*
  For support, suggestions, or custom bot requests:
  📧 *Email:* [hitechlan2013@gmail.com](mailto:hitechlan2013@gmail.com)
  💬 *Telegram:* [@CryptoCuteBoy](https://t.me/CryptoCuteBoy)
  
  ━━━━━━━━━━━━━━━━━━━━
  🌐 *Powered by CryptoCuteBot*
  `;

  bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
}
// In /help command
bot.onText(/\/help/, (msg) => {
  sendHelpMessage(msg.chat.id);
});

// PNL
bot.onText(/\/pnl(?:\s+(.+))?/i, (msg, match) => {
  const chatId = msg.chat.id;
  const wallet = match?.[1];

  if (!wallet) {
    bot.sendMessage(
      chatId,
      `🧐 Please send me the wallet address to check for PNL.`
    );
    userStates[chatId] = { awaiting: "pnl_wallet" };
    return;
  }

  handleWalletPNL(chatId, wallet);
});

// PRICE
bot.onText(/\/price(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match?.[1];

  if (!symbol) {
    bot.sendMessage(
      chatId,
      `🧐 Please send me the coin symbol you'd like to check. Example: BTC`
    );
    userStates[chatId] = { awaiting: "price_symbol" };
    return;
  }

  await sendPriceInfo(chatId, symbol);
});

// TOP 10
bot.onText(/\/top10/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `📈 Fetching Top 10 coins by market cap...`);

  const topCoins = await getTop10Coins();
  bot.sendMessage(chatId, topCoins, { parse_mode: "Markdown" });
});

// TRENDING
bot.onText(/\/trending/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `🚀 Fetching trending coins...`);

  const trendingCoins = await getTrendingCoins();
  bot.sendMessage(chatId, trendingCoins, { parse_mode: "Markdown" });
});

// Handle text responses
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith("/")) return;

  const state = userStates[chatId];

  if (!state) return;

  if (state.awaiting === "pnl_wallet") {
    delete userStates[chatId];
    handleWalletPNL(chatId, text);
  }

  if (state.awaiting === "price_symbol") {
    delete userStates[chatId];
    bot.sendMessage(chatId, `🔎 Checking price for: ${text.toUpperCase()}`);
    sendPriceInfo(chatId, text);
  }
});

// ============================ FUNCTIONS =================================

// Replace this with your actual API Key
const COVALENT_API_KEY = "cqt_rQ3P7wP8hc3P3FpBKQGyRkRkTmVH";

async function handleWalletPNL(chatId: number, wallet: string) {
  const chain = detectChain(wallet);
  const chainId = getChainId(chain);

  if (!chainId) {
    bot.sendMessage(
      chatId,
      `❌ Unsupported chain (${chain}) for PNL calculation.`
    );
    return;
  }

  if (chain === "Solana" || chain.startsWith("Bitcoin") || chain === "Tron") {
    bot.sendMessage(chatId, `⚠️ ${chain} support not yet available.`);
    return;
  }

  try {
    const [balanceNow, txData] = await Promise.all([
      getWalletBalance(chainId, wallet),
      getWalletTransactions(chainId, wallet),
    ]);

    const balance30dAgo = balanceNow * 0.8; // Mocked for example
    const pnl30d = balanceNow - balance30dAgo;
    const pnl7d = pnl30d * 0.3;

    const totalTrades = txData.length;
    const wins = Math.floor(totalTrades * 0.6);
    const winRate =
      totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0";

    const tradeValues = txData.map((tx) => tx.value || 0);
    const bestTrade = tradeValues.length > 0 ? Math.max(...tradeValues) : 0;
    const worstTrade = tradeValues.length > 0 ? Math.min(...tradeValues) : 0;

    const pnlReport = `
💼 *PNL Report*
👛 *Wallet*: \`${wallet}\`
🌐 *Chain*: ${chain}

📈 *30d PNL*: *${pnl30d >= 0 ? "+" : ""}$${pnl30d.toLocaleString()}* ${
      pnl30d >= 0 ? "🟢" : "🔴"
    }
📉 *7d PNL*: *${pnl7d >= 0 ? "+" : ""}$${pnl7d.toLocaleString()}* ${
      pnl7d >= 0 ? "🟢" : "🔴"
    }
🔄 *Total Trades*: *${totalTrades}*
💸 *Win Rate*: *${winRate}%*
🏆 *Best Trade*: *$${bestTrade.toLocaleString()}* 🚀
😓 *Worst Trade*: *$${Math.abs(worstTrade).toLocaleString()}* 💥
    `;

    bot.sendMessage(chatId, pnlReport, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Error fetching PNL:", error.message || error);
    bot.sendMessage(chatId, "❌ Failed to fetch PNL data. Try again later.");
  }
}

function detectChain(wallet: string): string {
  // Ethereum / EVM chains (defaulting to Ethereum for now)
  if (wallet.startsWith("0x") && wallet.length === 42) {
    return "Ethereum"; // Hardcoded to Ethereum
  }
  // Solana
  else if (wallet.length === 44) {
    return "Solana";
  }
  // Bitcoin
  else if (wallet.startsWith("1") || wallet.startsWith("3")) {
    return "Bitcoin";
  } else if (wallet.startsWith("bc1")) {
    return "Bitcoin";
  }
  // Tron
  else if (wallet.startsWith("T") && wallet.length === 34) {
    return "Tron";
  }
  // Cardano
  else if (wallet.startsWith("addr1")) {
    return "Cardano";
  }
  // Algorand
  else if (wallet.length === 58) {
    return "Algorand";
  }
  // Cosmos
  else if (wallet.startsWith("cosmos1")) {
    return "Cosmos";
  }

  return "Unknown";
}

function getChainId(chain: string): number | null {
  const chainIds: Record<string, number> = {
    Ethereum: 1,
    "BNB Chain": 56,
    Polygon: 137,
    "Arbitrum One": 42161,
    Optimism: 10,
    Avalanche: 43114,
    Fantom: 250,
    Cronos: 25,
    "Gnosis Chain": 100,
    Celo: 42220,
    Aurora: 1313161554,
    Moonbeam: 1284,
    Klaytn: 8217,
    Metis: 1088,
    Linea: 59144,
    Scroll: 534352,
  };

  return chainIds[chain] || null;
}

async function getWalletBalance(
  chainId: number,
  wallet: string
): Promise<number> {
  const url = `https://api.covalenthq.com/v1/${chainId}/address/${wallet}/balances_v2/?key=${COVALENT_API_KEY}`;

  try {
    const response = await axios.get(url);
    const items = response.data.data.items;

    const totalBalanceUSD = items.reduce((acc: number, item: any) => {
      return acc + (item.quote || 0);
    }, 0);

    return Math.round(totalBalanceUSD);
  } catch (error: any) {
    console.error(
      `Error fetching wallet balance for ${wallet}:`,
      error.message || error
    );
    throw new Error("Balance fetch failed");
  }
}

async function getWalletTransactions(
  chainId: number,
  wallet: string
): Promise<any[]> {
  const url = `https://api.covalenthq.com/v1/${chainId}/address/${wallet}/transactions_v2/?key=${COVALENT_API_KEY}`;

  try {
    const response = await axios.get(url);
    const txs = response.data.data.items;

    return txs.map((tx: any) => ({
      hash: tx.tx_hash,
      value: tx.value_quote || 0, // Transaction value in USD
      success: tx.successful,
    }));
  } catch (error: any) {
    console.error(
      `Error fetching transactions for ${wallet}:`,
      error.message || error
    );
    return []; // Return empty array if failed
  }
}

// PRICE INFO FIXED
async function sendPriceInfo(chatId: number, symbol: string) {
  const userInput = symbol.toLowerCase();

  try {
    if (!coinListCache.length) {
      coinListCache = await getCoinList();
    }

    const coin = coinListCache.find(
      (c: any) => c.symbol.toLowerCase() === userInput
    );

    if (!coin) {
      bot.sendMessage(
        chatId,
        `❌ Coin symbol *${userInput.toUpperCase()}* not found!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets`,
      {
        params: {
          vs_currency: "usd",
          ids: coin.id,
        },
      }
    );

    const data = res.data[0];

    if (!data) {
      bot.sendMessage(
        chatId,
        `❌ No data found for *${userInput.toUpperCase()}*.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const message = `
💎 *${data.name}* (${data.symbol.toUpperCase()})
💰 *Price*: $${data.current_price.toLocaleString()}
📉 *24h Change*: ${data.price_change_percentage_24h?.toFixed(2)}%
🏦 *Market Cap*: $${data.market_cap.toLocaleString()}
🔢 *Rank*: #${data.market_cap_rank}
🔄 *24h Volume*: $${data.total_volume.toLocaleString()}
📅 *ATH*: $${data.ath.toLocaleString()}
📉 *ATL*: $${data.atl.toLocaleString()}
🔗 [More Info](https://www.coingecko.com/en/coins/${coin.id})
`;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("❌ Error:", error);
    bot.sendMessage(chatId, `❌ Error fetching price data. Try again later.`);
  }
}

async function getCoinList() {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/list`
    );
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching coin list:", error);
    return [];
  }
}

// TOP 10 COINS IMPROVED
async function getTop10Coins() {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets`,
      {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 10,
          page: 1,
          price_change_percentage: "1h,24h,7d",
        },
      }
    );

    let message = `📊 *Top 10 Coins by Market Cap*\n\n`;

    res.data.forEach((coin: any, index: number) => {
      message += `
#${index + 1} - *${coin.name}* (${coin.symbol.toUpperCase()})
💰 Price: $${coin.current_price.toLocaleString()}
🏦 Market Cap: $${coin.market_cap.toLocaleString()}
📈 24h Change: ${coin.price_change_percentage_24h?.toFixed(2)}%
📉 7d Change: ${coin.price_change_percentage_7d_in_currency?.toFixed(2)}%
🔢 Rank: #${coin.market_cap_rank}
🔗 [More Info](https://www.coingecko.com/en/coins/${coin.id})

`;
    });

    return message;
  } catch (error) {
    console.error("❌ Error fetching top 10 coins:", error);
    return `❌ Failed to fetch top 10 coins.`;
  }
}

// TRENDING COINS IMPROVED
async function getTrendingCoins() {
  try {
    const trendingRes = await axios.get(
      `https://api.coingecko.com/api/v3/search/trending`
    );
    const trending = trendingRes.data.coins;

    if (!trending || trending.length === 0) {
      return "❌ No trending data found.";
    }

    // Extract Coin IDs
    const coinIds = trending.map((item: any) => item.item.id).join(",");

    // Fetch Market Data for those IDs
    const marketsRes = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets`,
      {
        params: {
          vs_currency: "usd",
          ids: coinIds,
          order: "market_cap_desc",
          price_change_percentage: "24h",
        },
      }
    );

    const marketData = marketsRes.data;

    let message = `🔥 *Trending Coins on CoinGecko*\n\n`;

    trending.forEach((item: any, index: number) => {
      const coin = item.item;
      const marketInfo = marketData.find((m: any) => m.id === coin.id);

      if (!marketInfo) {
        message += `#${index + 1} - *${
          coin.name
        }* (${coin.symbol.toUpperCase()})\n⚠️ No market data found.\n\n`;
        return;
      }

      message += `
#${index + 1} - *${marketInfo.name}* (${marketInfo.symbol.toUpperCase()})
🔥 Score: ${coin.score}
🏦 Market Cap Rank: ${marketInfo.market_cap_rank || "N/A"}
💰 Price: $${marketInfo.current_price.toLocaleString()}
📉 24h Change: ${marketInfo.price_change_percentage_24h?.toFixed(2)}%
🏦 Market Cap: $${marketInfo.market_cap.toLocaleString()}
🔗 [More Info](https://www.coingecko.com/en/coins/${coin.id})

`;
    });

    return message;
  } catch (error) {
    console.error("❌ Error fetching trending coins:", error);
    return `❌ Failed to fetch trending coins.`;
  }
}

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat.id;
  const data = query.data;

  if (!chatId || !data) {
    return;
  }

  const [action, param] = data.split(":");

  switch (action) {
    case "top10":
      bot.sendMessage(chatId, `📈 Fetching Top 10 coins by market cap...`);
      const topCoins = await getTop10Coins();
      bot.sendMessage(chatId, topCoins, { parse_mode: "Markdown" });
      break;

    case "trending":
      bot.sendMessage(chatId, `🚀 Fetching trending coins...`);
      const trendingCoins = await getTrendingCoins();
      bot.sendMessage(chatId, trendingCoins, { parse_mode: "Markdown" });
      break;

    case "ask_wallet_pnl":
      if (!param) {
        bot.sendMessage(
          chatId,
          `🧐 Please send me the wallet address to check for PNL.`
        );
        userStates[chatId] = { awaiting: "pnl_wallet" };

        // Show reply keyboard with /pnl option
        // bot.sendMessage(chatId, `Tap /pnl to enter your wallet address:`, {
        //   reply_markup: {
        //     keyboard: [[{ text: "/pnl" }]],
        //     resize_keyboard: true,
        //     one_time_keyboard: true,
        //   },
        // });
        return;
      }
      handleWalletPNL(chatId, param);
      break;

    case "ask_symbol_price":
      if (!param) {
        bot.sendMessage(
          chatId,
          `🧐 Please send me the coin symbol you'd like to check. Example: BTC`
        );
        userStates[chatId] = { awaiting: "price_symbol" };

        // Show reply keyboard with /price option
        // bot.sendMessage(chatId, `Tap /price to enter your coin symbol:`, {
        //   reply_markup: {
        //     keyboard: [[{ text: "/price" }]],
        //     resize_keyboard: true,
        //     one_time_keyboard: true,
        //   },
        // });
        return;
      }
      await sendPriceInfo(chatId, param);
      break;

    case "help":
      sendHelpMessage(chatId);
      break;

    default:
      bot.sendMessage(chatId, "❓ Unknown action.");
  }

  // Clean up spinner/loading icon on button
  bot.answerCallbackQuery(query.id);
});

import 'dotenv/config';
import { fetch, ProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Configure proxy (if enabled)
 * Determines whether to use proxy based on USE_PROXY environment variable
 * Proxy address is read from PROXY_URL environment variable, default 'http://127.0.0.1:7897'
 */
export function configureProxy() {
  const useProxy = process.env.USE_PROXY === 'true' || process.env.USE_PROXY === '1';
  
  if (useProxy) {
    const proxyUrl = process.env.PROXY_URL || 'http://127.0.0.1:7897';
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    return true;
  }
  
  return false;
}

export async function DiscordRequest(endpoint, options, retries = 3) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  
  // Check and clean DISCORD_TOKEN (ensure it doesn't contain "Bot " prefix)
  let token = process.env.DISCORD_TOKEN || '';
  if (token.startsWith('Bot ')) {
    console.warn('⚠️  Warning: DISCORD_TOKEN should not contain "Bot " prefix, code will add it automatically');
    token = token.replace(/^Bot\s+/, '');
  }
  
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Use fetch to make requests with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      // Configure proxy (if enabled)
      configureProxy();

      const res = await fetch(url, {
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'User-Agent': 'DiscordBot (https://github.com/superlcr/doraemon, 1.0.0)',
        },
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // throw API errors
      if (!res.ok) {
        const data = await res.json();
        console.log('HTTP status code:', res.status);
        if (res.status === 401) {
          console.error('❌ 401 Unauthorized - Authentication failed');
          console.error('Please check if DISCORD_TOKEN is correct:');
          console.error('  1. Ensure DISCORD_TOKEN value in .env file is correct');
          console.error('  2. Token should start with "Bot " (code will add it automatically)');
          console.error('  3. Ensure Token has not expired or been revoked');
          console.error('  4. Current Token length:', process.env.DISCORD_TOKEN?.length || 0);
          console.error('  5. Token first 10 characters:', process.env.DISCORD_TOKEN?.substring(0, 10) || 'not set');
        }
        throw new Error(JSON.stringify(data));
      }
      // return original response
      return res;
    } catch (error) {
      // If it's a connection reset error or network error, and there are retries left, retry
      const isRetryableError = 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.name === 'AbortError' ||
        error.message?.includes('fetch failed');
      
      if (isRetryableError && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10 seconds
        console.log(`Request failed (attempt ${attempt}/${retries}), retrying after ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's not a retryable error, or retries are exhausted, throw error
      throw error;
    }
  }
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

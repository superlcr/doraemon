import 'dotenv/config';
import { fetch, ProxyAgent, setGlobalDispatcher } from 'undici';

export async function DiscordRequest(endpoint, options, retries = 3) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  
  // 检查并清理 DISCORD_TOKEN（确保不包含 "Bot " 前缀）
  let token = process.env.DISCORD_TOKEN || '';
  if (token.startsWith('Bot ')) {
    console.warn('⚠️  警告: DISCORD_TOKEN 不应该包含 "Bot " 前缀，代码会自动添加');
    token = token.replace(/^Bot\s+/, '');
  }
  
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Use fetch to make requests with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

      const proxyAgent = new ProxyAgent('http://127.0.0.1:7897');
      setGlobalDispatcher(proxyAgent);

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
        console.log('HTTP 状态码:', res.status);
        if (res.status === 401) {
          console.error('❌ 401 Unauthorized - 认证失败');
          console.error('请检查 DISCORD_TOKEN 是否正确：');
          console.error('  1. 确保 .env 文件中的 DISCORD_TOKEN 值正确');
          console.error('  2. Token 应该以 "Bot " 开头（代码中会自动添加）');
          console.error('  3. 确保 Token 没有过期或被撤销');
          console.error('  4. 当前 Token 长度:', process.env.DISCORD_TOKEN?.length || 0);
          console.error('  5. Token 前10个字符:', process.env.DISCORD_TOKEN?.substring(0, 10) || '未设置');
        }
        throw new Error(JSON.stringify(data));
      }
      // return original response
      return res;
    } catch (error) {
      // 如果是连接重置错误或网络错误，且还有重试次数，则重试
      const isRetryableError = 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.name === 'AbortError' ||
        error.message?.includes('fetch failed');
      
      if (isRetryableError && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避，最多10秒
        console.log(`请求失败 (尝试 ${attempt}/${retries})，${delay}ms 后重试...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // 如果不是可重试的错误，或者已经用完重试次数，则抛出错误
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

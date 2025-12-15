import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { handleRemoteTaskCommand, handleRemoteServiceCallback } from './remote-bridge.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3001;
// To keep track of our active games
const activeGames = {};

// Check if PUBLIC_KEY is set
if (!process.env.PUBLIC_KEY) {
  console.error('❌ 错误: PUBLIC_KEY 环境变量未设置！');
  console.error('请在 .env 文件中配置 PUBLIC_KEY（从 Discord 开发者门户获取）');
  process.exit(1);
} else {
  console.log('✅ PUBLIC_KEY 已配置');
}

// Interaction handler function
const handleInteraction = async function (req, res) {
  // Parse JSON body after signature verification
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    body = JSON.parse(body.toString('utf8'));
  }
  
  // Interaction id, type and data
  const { id, type, data } = body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    // "chat" command - 触发远程任务（聊天任务）
    if (name === 'chat') {
      try {
        await handleRemoteTaskCommand(body, res);
        return; // handleRemoteTaskCommand 已经发送了响应
      } catch (error) {
        console.error('处理远程任务命令失败:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ 执行失败: ${error.message}`,
          },
        });
      }
    }

    // "remote-task" command - 触发远程任务（通用）
    if (name === 'remote-task') {
      try {
        await handleRemoteTaskCommand(body, res);
        return; // handleRemoteTaskCommand 已经发送了响应
      } catch (error) {
        console.error('处理远程任务命令失败:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ 执行失败: ${error.message}`,
          },
        });
      }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
};

// Error handler for signature verification failures
const signatureErrorHandler = (err, req, res, next) => {
  console.error('错误详情:', err);
  if (err.status === 401 || res.statusCode === 401) {
    console.error('❌ 签名验证失败 (401 Unauthorized)');
    console.error('可能的原因:');
    console.error('  1. PUBLIC_KEY 环境变量不正确');
    console.error('  2. Discord 开发者门户中的交互端点 URL 配置错误');
    console.error('  3. ngrok URL 已更改，但 Discord 配置未更新');
    console.error('  4. 请求被中间件修改');
    console.error('当前 PUBLIC_KEY 长度:', process.env.PUBLIC_KEY?.length || 0);
    if (!res.headersSent) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next(err);
};

// Wrapper for verifyKeyMiddleware with better error handling
const verifyKeyWithLogging = (publicKey) => {
  return (req, res, next) => {
    // console.log(`收到 ${req.path} 请求`);
    // console.log('请求头:', {
    //   'x-signature-ed25519': req.headers['x-signature-ed25519'] ? '存在' : '缺失',
    //   'x-signature-timestamp': req.headers['x-signature-timestamp'] ? '存在' : '缺失',
    //   'content-type': req.headers['content-type']
    // });
    
    const middleware = verifyKeyMiddleware(publicKey);
    middleware(req, res, (err) => {
      if (err) {
        console.error('验证中间件错误:', err);
        return next(err);
      }
      // 如果验证失败，verifyKeyMiddleware 会直接发送 401 响应
      // 检查响应是否已发送
      if (res.headersSent && res.statusCode === 401) {
        console.error('❌ 签名验证失败 - 响应已发送 401');
        return;
      }
      next();
    });
  };
};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 * Note: express.raw is required to preserve the raw body for signature verification
 */
app.post(
  '/interactions',
  express.raw({ type: 'application/json' }),
  verifyKeyWithLogging(process.env.PUBLIC_KEY),
  handleInteraction
);

/**
 * Root endpoint for Discord webhooks (in case Discord is configured to use /)
 */
app.post(
  '/',
  express.raw({ type: 'application/json' }),
  verifyKeyWithLogging(process.env.PUBLIC_KEY),
  handleInteraction
);

/**
 * 远程服务回调端点（用于接收任务完成通知）
 * 注意：此端点不需要Discord签名验证，需要由远程服务调用
 */
app.post('/api/discord/ppt-callback', express.json(), async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('收到远程服务回调:', callbackData);
    
    await handleRemoteServiceCallback(callbackData);
    
    res.json({ success: true, message: '回调处理成功' });
  } catch (error) {
    console.error('处理远程服务回调失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware (must be after routes)
app.use(signatureErrorHandler);

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

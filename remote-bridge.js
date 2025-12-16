import 'dotenv/config';
import { DiscordRequest, configureProxy } from './utils.js';
import { InteractionResponseType } from 'discord-interactions';
import undici from 'undici';
import fs from 'fs/promises';

const { fetch, FormData } = undici;
// File 是 Node.js 18+ 的全局 API，不需要从 undici 导入

/**
 * 远程服务桥接模块
 * 用于通过Discord消息触发远程服务执行任务，并在完成后回调Discord
 */

// 远程服务配置
const REMOTE_SERVICE_URL = process.env.REMOTE_SERVICE_URL || '';
const REMOTE_SERVICE_API_KEY = process.env.REMOTE_SERVICE_API_KEY || '';
const REMOTE_SERVICE_CALLBACK_URL = process.env.REMOTE_SERVICE_CALLBACK_URL || '';

// 存储任务状态，用于跟踪任务执行情况
const taskStatus = new Map(); // taskId -> { channelId, messageId, userId, startTime }

/**
 * 调用Discord webhook（用于interaction followup消息）
 * @param {string} url - Discord webhook URL
 * @param {object} options - fetch选项
 * @returns {Promise<Response>} fetch响应
 */
async function discordWebhookRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

  // 配置代理（如果启用）
  configureProxy();

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 发送带本地文件附件的Discord消息（可选地回复某条消息）
 * @param {string} channelId - 频道ID
 * @param {string|null} messageId - 要回复的消息ID（可选）
 * @param {string} content - 文本内容
 * @param {string} filePath - 本地文件路径
 */
async function sendDiscordMessageWithFile(channelId, messageId, content, filePath) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

  // 配置代理（如果启用）
  configureProxy();

  try {
    // 读取本地文件
    const fileBuffer = await fs.readFile(filePath);
    const fileName = filePath.split('/').pop() || 'file.dat';

    const form = new FormData();
    const payload = {
      content,
    };

    if (messageId) {
      payload.message_reference = {
        message_id: messageId,
      };
    }

    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', new File([fileBuffer], fileName));

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`发送带文件的消息失败: ${res.status} ${errorText}`);
    }

    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 调用远程服务触发任务执行
 * @param {string} taskType - 任务类型
 * @param {object} taskParams - 任务参数
 * @param {string} callbackToken - 回调token，用于标识任务
 * @returns {Promise<object>} 远程服务响应
 */
export async function triggerRemoteTask(taskType, taskParams = {}, callbackToken) {
  if (!REMOTE_SERVICE_URL) {
    throw new Error('REMOTE_SERVICE_URL 环境变量未设置');
  }

  const taskId = callbackToken;
  
  // 从 taskParams 中提取用户输入的文本和其他参数
  const userMessage = taskParams.userMessage || '';
  const pptText = userMessage || taskParams.ppt_text || '';
  const pptStyle = taskParams.ppt_style || 'black';
  
  // 构建任务参数，优先使用提取的值，然后合并其他参数
  const finalTaskParams = {
    ...taskParams, // 先展开所有传入的参数
    ppt_text: pptText, // 覆盖 ppt_text（如果 userMessage 有值，优先使用）
    ppt_style: pptStyle, // 设置默认样式
  };
  
  const payload = {
    taskType,
    taskParams: finalTaskParams,
    callbackToken: taskId,
    callbackUrl: REMOTE_SERVICE_CALLBACK_URL,
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  if (REMOTE_SERVICE_API_KEY) {
    headers['Authorization'] = `Bearer ${REMOTE_SERVICE_API_KEY}`;
  }

  try {

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    // const response = await fetch(REMOTE_SERVICE_URL + '/api/discord/hello', {
    const response = await fetch(REMOTE_SERVICE_URL + '/api/discord/create-task', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`远程服务请求失败: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return { taskId, ...result };
  } catch (error) {
    console.error('调用远程服务失败:', error);
    throw error;
  }
}

/**
 * 发送任务回调消息到Discord（回复"任务已启动"的消息）
 * @param {string} taskId - 任务ID
 * @param {object} result - 任务执行结果
 * @param {boolean} isError - 是否为错误结果
 */
export async function sendTaskCallbackToDiscord(taskId, result, isError = false) {
  const taskInfo = taskStatus.get(taskId);
  if (!taskInfo) {
    console.error(`未找到任务 ${taskId} 的信息`);
    return;
  }

  const { channelId, messageId, userId } = taskInfo;
  const elapsedTime = Date.now() - taskInfo.startTime;
  const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

  let content;
  try {
    if (isError) {
      content = `❌ <@${userId}> 任务执行失败！\n` +
                `⏱️ 耗时: ${elapsedSeconds}秒\n` +
                `📝 错误信息: ${result}`;
      await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: {
          content,
          message_reference: {
            message_id: messageId,
          },
        },
      });
    } else {
      const filePath = result.trim();
      content = `✅ <@${userId}> 任务执行完成！\n` +
                `⏱️ 耗时: ${elapsedSeconds}秒\n` +
                `📎 已为你生成文件，请查收附件。`;
  
      await sendDiscordMessageWithFile(channelId, messageId, content, filePath);
    }
    // 清理任务状态
    taskStatus.delete(taskId);
  } catch (error) {
    console.error('发送Discord回调消息失败:', error);
    // 尝试仅发送文字消息（不带附件）
    try {
      await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: {
          content,
        },
      });
      taskStatus.delete(taskId);
    } catch (fallbackError) {
      console.error('发送Discord消息失败:', fallbackError);
    }
  }
}

/**
 * 处理Discord命令，触发远程任务
 * @param {object} interactionData - Discord交互数据（完整的body对象）
 * @param {object} res - Express响应对象
 * @returns {Promise<object>} Discord响应
 */
export async function handleRemoteTaskCommand(interactionData, res) {
  const { id, channel_id, member, data } = interactionData;
  const userId = member?.user?.id;
  const channelId = channel_id;
  const taskType = data?.name || 'default'; // 使用命令名称作为任务类型

  // 提取用户输入的文本（从命令选项中获取）
  const userMessage = data?.options?.find(opt => opt.name === 'message')?.value || '';

  // 生成任务ID
  const taskId = generateTaskId();

  try {
    // 立即响应Discord，表示命令已收到
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    // 调用远程服务，传递用户输入的文本
    const response = await triggerRemoteTask(taskType, { userId, userMessage }, taskId);
    console.log('handleRemoteTaskCommand:triggerRemoteTask: response', response);
    
    // 判断远程服务是否返回"任务已启动"（支持多种响应格式）
    const isTaskStarted = response.status === 'success'

    // 使用 interaction token 发送 followup 消息
    const interactionToken = interactionData.token;
    
    if (isTaskStarted) {
      // 如果远程服务返回"任务已启动"，发送消息到Discord
      try {
        const messageResponse = await discordWebhookRequest(
          `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}?wait=true`,
          {
            method: 'POST',
            body: {
              content: '任务已启动',
            },
          }
        );

        if (messageResponse.ok) {
          const messageData = await messageResponse.json();
          const messageId = messageData.id;

          // 存储任务信息，包括消息ID
          taskStatus.set(taskId, {
            channelId,
            messageId,
            userId,
            startTime: Date.now(),
          });

          console.log(`任务 ${taskId} 已启动，消息ID: ${messageId}`);
        } else {
          const errorText = await messageResponse.text();
          console.error('发送"任务已启动"消息失败:', errorText);
          throw new Error('无法发送"任务已启动"消息');
        }
      } catch (error) {
        console.error('发送消息失败:', error);
        throw error;
      }
    } else {
      // 如果远程服务立即返回结果（不是异步任务），直接处理
      const resultContent = response.message;
      const messageResponse = await discordWebhookRequest(
        `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}?wait=true`,
        {
          method: 'POST',
          body: {
            content: resultContent,
          },
        }
      );

      if (messageResponse.ok) {
        const messageData = await messageResponse.json();
        taskStatus.set(taskId, {
          channelId,
          messageId: messageData.id,
          userId,
          startTime: Date.now(),
        });
      }
    }
  } catch (error) {
    console.error('处理远程任务命令失败:', error);
    // 发送错误消息
    try {
      await discordWebhookRequest(
        `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionData.token}`,
        {
          method: 'POST',
          body: {
            content: `❌ 执行失败: ${error.message}`,
          },
        }
      );
    } catch (sendError) {
      console.error('发送错误消息失败:', sendError);
    }
  }

  return { taskId };
}

/**
 * 处理远程服务的webhook回调
 * @param {object} callbackData - 回调数据
 */
export async function handleRemoteServiceCallback(callbackData) {
  // 支持多种格式的回调数据
  const callbackToken = callbackData.callbackToken;
  const status = callbackData.status;
  const taskType = callbackData.taskType;
  const data = callbackData.data;
  const filePath = callbackData.filePath;
  const error = callbackData.message;
  
  if (!callbackToken) {
    console.error('回调数据中缺少 callbackToken/taskId/token');
    console.error('收到的回调数据:', callbackData);
    return;
  }

  const taskInfo = taskStatus.get(callbackToken);
  if (!taskInfo) {
    console.error(`未找到任务 ${callbackToken} 的信息`);
    return;
  }

  // 处理任务完成的情况
  if (status === 'success') {
    await sendTaskCallbackToDiscord(callbackToken, filePath, false);
  } else if (status === 'failed') {
    await sendTaskCallbackToDiscord(callbackToken, error || { message: '任务执行失败' }, true);
  } else {
    // 如果有其他状态，记录日志
    console.log(`任务 ${callbackToken} 状态: ${status}`);
  }
}

/**
 * 生成唯一的任务ID
 * @returns {string} 任务ID
 */
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取任务状态
 * @param {string} taskId - 任务ID
 * @returns {object|null} 任务状态信息
 */
export function getTaskStatus(taskId) {
  return taskStatus.get(taskId) || null;
}

/**
 * 清理过期的任务状态（超过24小时的任务）
 */
export function cleanupExpiredTasks() {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24小时

  for (const [taskId, taskInfo] of taskStatus.entries()) {
    if (now - taskInfo.startTime > expireTime) {
      taskStatus.delete(taskId);
      console.log(`清理过期任务: ${taskId}`);
    }
  }
}

// 定期清理过期任务（每小时执行一次）
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredTasks, 60 * 60 * 1000);
}

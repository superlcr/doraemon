import 'dotenv/config';
import { DiscordRequest, configureProxy } from './utils.js';
import { InteractionResponseType } from 'discord-interactions';
import undici from 'undici';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const { fetch, FormData } = undici;
// File is a global API in Node.js 18+, no need to import from undici

/**
 * Remote service bridge module
 * Used to trigger remote service to execute tasks through Discord messages, and callback to Discord after completion
 */

// Voice name mapping
const VOICE_NAMES = {
  'male-qn-jingying': 'Professional Male',
  'dj_m_chat_0306_05': 'Clear Male Voice',
  'houge': 'Monkey King',
  'Stressed_Lady': 'Radio Host (Female)',
  'tianmei': 'Sweet Girl',
  'Podcast_girl_platform': 'Casual Senior (Female)',
  'audiobook_male_1': 'Magnetic Male Voice',
  'nvhai': 'Cute Kid',
};

// Remote service configuration
const REMOTE_SERVICE_URL = process.env.REMOTE_SERVICE_URL || '';
const REMOTE_SERVICE_API_KEY = process.env.REMOTE_SERVICE_API_KEY || '';
const REMOTE_SERVICE_CALLBACK_URL = process.env.REMOTE_SERVICE_CALLBACK_URL || '';

// Store task status for tracking task execution
const taskStatus = new Map(); // taskId -> { channelId, messageId, userId, startTime }

/**
 * Call Discord webhook (for interaction followup messages)
 * @param {string} url - Discord webhook URL
 * @param {object} options - fetch options
 * @returns {Promise<Response>} fetch response
 */
async function discordWebhookRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  // Configure proxy (if enabled)
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
 * Send Discord message with local file attachment (optionally reply to a message)
 * @param {string} channelId - Channel ID
 * @param {string|null} messageId - Message ID to reply to (optional)
 * @param {string} content - Text content
 * @param {string} filePath - Local file path
 */
async function sendDiscordMessageWithFile(channelId, messageId, content, filePath) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  // Configure proxy (if enabled)
  configureProxy();

  try {
    // Read local file
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
      throw new Error(`Failed to send message with file: ${res.status} ${errorText}`);
    }

    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Call remote service to trigger task execution
 * @param {string} taskType - Task type
 * @param {object} taskParams - Task parameters
 * @param {string} callbackToken - Callback token, used to identify task
 * @returns {Promise<object>} Remote service response
 */
export async function triggerRemoteTask(taskType, taskParams = {}, callbackToken) {
  if (!REMOTE_SERVICE_URL) {
    throw new Error('REMOTE_SERVICE_URL environment variable is not set');
  }

  const taskId = callbackToken;
  
  // Extract user input text and other parameters from taskParams
  const userId = taskParams.userId || '';
  const text = taskParams.text || '';
  const theme = taskParams.theme;
  const voice = taskParams.voice || 'male-qn-jingying';
  const screen = taskParams.screen || '';
  
  // Build task parameters, prioritize extracted values, then merge other parameters
  const finalTaskParams = {
    user_id: userId,
    ppt_text: text,
    ppt_style: theme,
    voice: voice,
    orientation: screen,
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
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
      throw new Error(`Remote service request failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return { taskId, ...result };
  } catch (error) {
    console.error('Failed to call remote service:', error);
    throw error;
  }
}

/**
 * Download file from URL to local path
 * @param {string} url - File download URL
 * @param {string} localPath - Local file path to save
 * @returns {Promise<string>} Local file path
 */
async function downloadFile(url, localPath) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout for large files

  // Configure proxy (if enabled)
  configureProxy();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      // Check if response is a Cloudflare error page
      const isCloudflareError = errorText.includes('Cloudflare') || 
                                errorText.includes('cf-error-details') ||
                                response.status === 530;
      
      if (isCloudflareError) {
        throw new Error(`Download link may be expired or invalid (Cloudflare error ${response.status}). Please check the download URL or regenerate the file.`);
      }
      
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`);
    }

    // Ensure directory exists
    const dir = path.dirname(localPath);
    await fs.mkdir(dir, { recursive: true });

    // Stream the file to disk
    const fileStream = createWriteStream(localPath);
    await pipeline(response.body, fileStream);

    clearTimeout(timeoutId);
    console.log(`File downloaded successfully: ${localPath}`);
    return localPath;
  } catch (error) {
    clearTimeout(timeoutId);
    // Clean up partially downloaded file if it exists
    try {
      await fs.unlink(localPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
    console.error(`Failed to download file from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Check if file exists
 * @param {string} filePath - File path to check
 * @returns {Promise<boolean>} Whether file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send task callback message to Discord (reply to "task started" message)
 * @param {string} taskId - Task ID
 * @param {object} result - Task execution result
 * @param {boolean} isError - Whether it's an error result
 */
export async function sendTaskCallbackToDiscord(taskId, result, isError = false) {
  const taskInfo = taskStatus.get(taskId);
  if (!taskInfo) {
    console.error(`Task ${taskId} information not found`);
    return;
  }

  const { channelId, messageId, userId } = taskInfo;
  const elapsedTime = Date.now() - taskInfo.startTime;
  const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

  let content;
  try {
    if (isError) {
      content = `❌ <@${userId}> Video generation failed.\n` +
                `⏱️ Elapsed time: ${elapsedSeconds} seconds\n`;
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
      content = `✅ Great job <@${userId}>! Your task is done.\n` +
                `⏱️ Time spent: ${elapsedSeconds}s\n` +
                `🎥 Check out the generated file attached above.`;
  
      await sendDiscordMessageWithFile(channelId, messageId, content, filePath);
    }
    // Clean up task status
    taskStatus.delete(taskId);
  } catch (error) {
    console.error('Failed to send Discord callback message:', error);
    // Try to send text message only (without attachment)
    try {
      await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: {
          content,
        },
      });
      taskStatus.delete(taskId);
    } catch (fallbackError) {
      console.error('Failed to send Discord message:', fallbackError);
    }
  }
}

/**
 * Handle Discord command, trigger remote task
 * @param {object} interactionData - Discord interaction data (complete body object)
 * @param {object} res - Express response object
 * @returns {Promise<object>} Discord response
 */
export async function handleRemoteTaskCommand(interactionData, res) {
  const { id, channel_id, member, data } = interactionData;
  const userId = member?.user?.id;
  const channelId = channel_id;
  const taskType = data?.name || 'default'; // Use command name as task type

  // Extract user input text (from command options)
  const text = data?.options?.find(opt => opt.name === 'text')?.value || '';
  const theme = data?.options?.find(opt => opt.name === 'theme')?.value || '';
  const voice = data?.options?.find(opt => opt.name === 'voice')?.value || 'male-qn-jingying';
  const screen = data?.options?.find(opt => opt.name === 'screen')?.value || '16:9';

  // Generate task ID
  const taskId = generateTaskId();

  try {
    // Immediately respond to Discord, indicating command received
    res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    // Call remote service, pass user input text and other parameters
    const response = await triggerRemoteTask(taskType, { userId, text, theme, voice, screen }, taskId);
    console.log('handleRemoteTaskCommand:triggerRemoteTask: response', response);
    
    // Check if remote service returns "task started" (supports multiple response formats)
    const isTaskStarted = response.status === 'success'

    // Use interaction token to send followup message
    const interactionToken = interactionData.token;
    
    if (isTaskStarted) {
      // If remote service returns "task started", send message to Discord
      try {
        // Format user message in code block with spoiler for proper folding
        const formattedUserMessage = text 
          ? `\`\`\`\n${text}\n\`\`\``
          : '';
        
        // Get voice display name
        const voiceName = VOICE_NAMES[voice] || voice;
        // Capitalize theme name
        const themeName = theme.charAt(0).toUpperCase() + theme.slice(1);
        // Screen orientation label
        const screenLabel = screen === 'portrait' ? 'Portrait 9:16' : 'Landscape 16:9';
        
        const messageResponse = await discordWebhookRequest(
          `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}?wait=true`,
          {
            method: 'POST',
            body: {
              content: `🎥 Generating video for <@${userId}>, please wait ...\n\n🎨 Theme: ${themeName}    🎤 Voice: ${voiceName}    🖥 Screen: ${screenLabel}\n📄 Text：\n${formattedUserMessage}`,
            },
          }
        );

        if (messageResponse.ok) {
          const messageData = await messageResponse.json();
          const messageId = messageData.id;

          // Store task information, including message ID
          taskStatus.set(taskId, {
            channelId,
            messageId,
            userId,
            startTime: Date.now(),
          });

          console.log(`Task ${taskId} started, message ID: ${messageId}`);
        } else {
          const errorText = await messageResponse.text();
          console.error('Failed to send "task started" message:', errorText);
          throw new Error('Unable to send "task started" message');
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    } else {
      // If remote service immediately returns result (not async task), handle directly
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
    console.error('Failed to handle remote task command:', error);
    // Send error message
    try {
      await discordWebhookRequest(
        `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionData.token}`,
        {
          method: 'POST',
          body: {
            content: `❌ Execution failed: ${error.message}`,
          },
        }
      );
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }

  return { taskId };
}

/**
 * Handle remote service webhook callback
 * @param {object} callbackData - Callback data
 */
export async function handleRemoteServiceCallback(callbackData) {
  // Support multiple callback data formats
  const callbackToken = callbackData.callbackToken;
  const status = callbackData.status;
  const taskType = callbackData.taskType;
  const data = callbackData.data;
  let filePath = callbackData.filePath;
  const error = callbackData.message;
  
  if (!callbackToken) {
    console.error('Missing callbackToken/taskId/token in callback data');
    console.error('Received callback data:', callbackData);
    return;
  }

  const taskInfo = taskStatus.get(callbackToken);
  if (!taskInfo) {
    console.error(`Task ${callbackToken} information not found`);
    return;
  }

  // Handle task completion case
  if (status === 'success') {
    try {
      // Check if filePath exists
      if (filePath && !(await fileExists(filePath))) {
        console.log(`File not found at ${filePath}, attempting to download from URL...`);
        
        // If file doesn't exist and data field contains download URL, download it
        if (data) {
          const downloadUrl = typeof data === 'string' ? data : data.url || data.downloadUrl;
          
          if (downloadUrl) {
            // Generate local file path
            // Extract filename from filePath (handle both Unix and Windows paths)
            let fileName = '';
            if (filePath) {
              // Normalize Windows paths by replacing backslashes with forward slashes
              const normalizedPath = filePath.replace(/\\/g, '/');
              fileName = path.basename(normalizedPath);
            }
            
            // Fallback to generate filename if extraction failed
            if (!fileName) {
              // Try to extract filename from URL or use default
              const urlMatch = downloadUrl.match(/\/([^\/\?]+)(\?|$)/);
              fileName = urlMatch ? urlMatch[1] : `task_${callbackToken}_${Date.now()}.mp4`;
            }
            
            const localDir = path.join(process.cwd(), 'downloads');
            const localPath = path.join(localDir, fileName);
            
            console.log(`Downloading file from ${downloadUrl} to ${localPath}`);
            filePath = await downloadFile(downloadUrl, localPath);
          } else {
            console.error('No download URL found in data field');
            await sendTaskCallbackToDiscord(callbackToken, 'File not found and no download URL provided', true);
            return;
          }
        } else {
          console.error('File not found and no data field provided');
          await sendTaskCallbackToDiscord(callbackToken, 'File not found and no download URL provided', true);
          return;
        }
      }
      
      // Send file to Discord
      await sendTaskCallbackToDiscord(callbackToken, filePath, false);
    } catch (error) {
      console.error('Failed to process file:', error);
      // Provide user-friendly error message
      const errorMessage = error.message || 'Unknown error occurred while processing file';
      await sendTaskCallbackToDiscord(callbackToken, `❌ Failed to download file: ${errorMessage}`, true);
    }
  } else if (status === 'failed') {
    await sendTaskCallbackToDiscord(callbackToken, error || { message: 'Task execution failed' }, true);
  } else {
    // If there are other statuses, log
    console.log(`Task ${callbackToken} status: ${status}`);
  }
}

/**
 * Generate unique task ID
 * @returns {string} Task ID
 */
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get task status
 * @param {string} taskId - Task ID
 * @returns {object|null} Task status information
 */
export function getTaskStatus(taskId) {
  return taskStatus.get(taskId) || null;
}

/**
 * Clean up expired task status (tasks older than 24 hours)
 */
export function cleanupExpiredTasks() {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 hours

  for (const [taskId, taskInfo] of taskStatus.entries()) {
    if (now - taskInfo.startTime > expireTime) {
      taskStatus.delete(taskId);
      console.log(`Cleaned up expired task: ${taskId}`);
    }
  }
}

// Periodically clean up expired tasks (execute once per hour)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredTasks, 60 * 60 * 1000);
}

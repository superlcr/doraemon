import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

// 检查必要的环境变量
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ 错误: DISCORD_TOKEN 环境变量未设置！');
  console.error('请在 .env 文件中配置 DISCORD_TOKEN（从 Discord 开发者门户获取 Bot Token）');
  process.exit(1);
}

if (!process.env.APP_ID) {
  console.error('❌ 错误: APP_ID 环境变量未设置！');
  console.error('请在 .env 文件中配置 APP_ID（从 Discord 开发者门户获取 Application ID）');
  process.exit(1);
}

console.log('✅ 环境变量检查通过');
console.log('APP_ID:', process.env.APP_ID);
console.log('DISCORD_TOKEN 长度:', process.env.DISCORD_TOKEN?.length || 0);

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: 'challenge',
  description: 'Challenge to a match of rock paper scissors',
  options: [
    {
      type: 3,
      name: 'object',
      description: 'Pick your object',
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

// Chat command - 触发远程聊天任务
const CHAT_COMMAND = {
  name: 'chat',
  description: '触发远程聊天任务',
  options: [
    {
      type: 3, // STRING 类型，支持长文本
      name: 'message',
      description: '要发送的消息内容',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Remote task command - 触发远程服务任务（通用）
const REMOTE_TASK_COMMAND = {
  name: 'remote-task',
  description: '触发远程服务执行任务',
  options: [
    {
      type: 3,
      name: 'task-type',
      description: '任务类型',
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, CHAT_COMMAND, REMOTE_TASK_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);

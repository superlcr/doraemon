import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

// Check required environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Error: DISCORD_TOKEN environment variable is not set!');
  console.error('Please configure DISCORD_TOKEN in .env file (get Bot Token from Discord Developer Portal)');
  process.exit(1);
}

if (!process.env.APP_ID) {
  console.error('❌ Error: APP_ID environment variable is not set!');
  console.error('Please configure APP_ID in .env file (get Application ID from Discord Developer Portal)');
  process.exit(1);
}

console.log('✅ Environment variables check passed');
console.log('APP_ID:', process.env.APP_ID);
console.log('DISCORD_TOKEN length:', process.env.DISCORD_TOKEN?.length || 0);

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

// PPT command - Trigger remote PPT generation task
const PPT_COMMAND = {
  name: 'ppt',
  description: 'Trigger remote PPT generation task',
  options: [
    {
      type: 3, // STRING type, supports long text
      name: 'message',
      description: 'Message content to send',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Remote task command - Trigger remote service task (generic)
const REMOTE_TASK_COMMAND = {
  name: 'remote-task',
  description: 'Trigger remote service to execute task',
  options: [
    {
      type: 3,
      name: 'task-type',
      description: 'Task type',
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, PPT_COMMAND, REMOTE_TASK_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);

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
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

// Check if PUBLIC_KEY is set
if (!process.env.PUBLIC_KEY) {
  console.error('❌ Error: PUBLIC_KEY environment variable is not set!');
  console.error('Please configure PUBLIC_KEY in .env file (get it from Discord Developer Portal)');
  process.exit(1);
} else {
  console.log('✅ PUBLIC_KEY configured');
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

    // "challenge" command
    if (name === 'challenge' && id) {
      // Interaction context
      const context = req.body.context;
      // User ID is in user field for (G)DMs, and member for servers
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      // User's object choice
      const objectName = req.body.data.options[0].value;

      // Create active game using message ID as the game ID
      activeGames[id] = {
        id: userId,
        objectName,
      };

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `Rock papers scissors challenge from <@${userId}>`,
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  // Append the game ID to use later on
                  custom_id: `accept_button_${req.body.id}`,
                  label: 'Accept',
                  style: ButtonStyleTypes.PRIMARY,
                },
              ],
            },
          ],
        },
      });
    }


    // "ppt" command - Trigger remote task (PPT generation task)
    if (name === 'ppt') {
      try {
        await handleRemoteTaskCommand(body, res);
        return; // handleRemoteTaskCommand has already sent the response
      } catch (error) {
        console.error('Failed to handle remote task command:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Execution failed: ${error.message}`,
          },
        });
      }
    }

    // "remote-task" command - Trigger remote task (generic)
    if (name === 'remote-task') {
      try {
        await handleRemoteTaskCommand(body, res);
        return; // handleRemoteTaskCommand has already sent the response
      } catch (error) {
        console.error('Failed to handle remote task command:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Execution failed: ${error.message}`,
          },
        });
      }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;
  
    if (componentId.startsWith('accept_button_')) {
      // get the associated game ID
      const gameId = componentId.replace('accept_button_', '');
      // Delete message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
      try {
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: 'What is your object of choice?',
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                  },
                ],
              },
            ],
          },
        });
        // Delete previous message
        await DiscordRequest(endpoint, { method: 'DELETE' });
      } catch (err) {
        console.error('Error sending message:', err);
      }
    } else if (componentId.startsWith('select_choice_')) {
      // get the associated game ID
      const gameId = componentId.replace('select_choice_', '');
  
      if (activeGames[gameId]) {
        // Interaction context
        const context = req.body.context;
        // Get user ID and object choice for responding user
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
        const objectName = data.values[0];
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
          id: userId,
          objectName,
        });
  
        // Remove game from storage
        delete activeGames[gameId];
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
  
        try {
          // Send results
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: resultStr
                }
              ]
              },
          });
          // Update ephemeral message
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: 'Nice choice ' + getRandomEmoji()
                }
              ],
            },
          });
        } catch (err) {
          console.error('Error sending message:', err);
        }
      }
    }
  
    return;
  }
  
  
  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
};

// Error handler for signature verification failures
const signatureErrorHandler = (err, req, res, next) => {
  console.error('Error details:', err);
  if (err.status === 401 || res.statusCode === 401) {
    console.error('❌ Signature verification failed (401 Unauthorized)');
    console.error('Possible reasons:');
    console.error('  1. PUBLIC_KEY environment variable is incorrect');
    console.error('  2. Interaction endpoint URL in Discord Developer Portal is misconfigured');
    console.error('  3. ngrok URL has changed but Discord configuration is not updated');
    console.error('  4. Request was modified by middleware');
    console.error('Current PUBLIC_KEY length:', process.env.PUBLIC_KEY?.length || 0);
    if (!res.headersSent) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next(err);
};

// Wrapper for verifyKeyMiddleware with better error handling
const verifyKeyWithLogging = (publicKey) => {
  return (req, res, next) => {
    // console.log(`Received ${req.path} request`);
    // console.log('Request headers:', {
    //   'x-signature-ed25519': req.headers['x-signature-ed25519'] ? 'present' : 'missing',
    //   'x-signature-timestamp': req.headers['x-signature-timestamp'] ? 'present' : 'missing',
    //   'content-type': req.headers['content-type']
    // });
    
    const middleware = verifyKeyMiddleware(publicKey);
    middleware(req, res, (err) => {
      if (err) {
        console.error('Verification middleware error:', err);
        return next(err);
      }
      // If verification fails, verifyKeyMiddleware will directly send 401 response
      // Check if response has been sent
      if (res.headersSent && res.statusCode === 401) {
        console.error('❌ Signature verification failed - 401 response sent');
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
 * Remote service callback endpoint (for receiving task completion notifications)
 * Note: This endpoint does not require Discord signature verification, needs to be called by remote service
 */
app.post('/api/discord/ppt-callback', express.json(), async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('Received remote service callback:', callbackData);
    
    await handleRemoteServiceCallback(callbackData);
    
    res.json({ success: true, message: 'Callback processed successfully' });
  } catch (error) {
    console.error('Failed to process remote service callback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware (must be after routes)
app.use(signatureErrorHandler);

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

import "dotenv/config";
import express from "express";

import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from "discord-interactions";
import { ALL_COMMANDS } from "./commands";
import { SlashCommand } from "./utils/slash_command";

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

const PUBLIC_KEY = process.env.PUBLIC_KEY;
if (!PUBLIC_KEY) {
  console.error("Missing PUBLIC_KEY in environment variables");
  process.exit(1);
}

const commands = (() => {
  const cmds: Record<string, SlashCommand> = {};
  for (const cmd of ALL_COMMANDS) {
    cmds[cmd.metadata.name] = cmd;
  }
  return cmds;
})();

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post(
  "/interactions",
  verifyKeyMiddleware(PUBLIC_KEY),
  async function (req, res) {
    // Interaction id, type and data
    const { id, type, data } = req.body;

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
      const command = commands[name];

      if (command === undefined) {
        console.error(`unknown command: ${name}`);
        return res.status(400).json({ error: "unknown command" });
      }

      const response = command.handle(req.body);
      return res.send(response);
    }

    console.error("unknown interaction type", type);
    return res.status(400).json({ error: "unknown interaction type" });
  }
);

app.listen(PORT, () => {
  console.log("Listening on port", PORT);
});

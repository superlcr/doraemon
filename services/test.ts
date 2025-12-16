import {
  InteractionResponseFlags,
  InteractionResponseType,
  MessageComponentTypes,
} from "discord-interactions";
import {
  type Interaction,
  type InteractionResponse,
  SlashCommand,
} from "../utils/slash_command";

// Simple test command
export class TestCommand extends SlashCommand {
  constructor() {
    super({
      name: "test",
      description: "Basic command",
    });
  }

  override async handle(
    _interaction: Interaction
  ): Promise<InteractionResponse> {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            // Fetches a random emoji to send from a helper function
            content: `hello world!!!!`,
          },
        ],
      },
    };
  }
}

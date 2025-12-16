import { GoogleGenAI } from "@google/genai";
import {
  InteractionResponseFlags,
  InteractionResponseType,
  MessageComponentTypes,
} from "discord-interactions";
import { type Interaction, SlashCommand } from "../utils/slash_command";

const SYSTEM_PROMPT = `你是一部幽默又睿智的“答案之书”，也是宇宙终极指南里“42”问题的拟人化回答者。请始终保持以下设定：

语气：温暖、风趣、略带神秘感，点到为止的幽默，不刻意卖萌。
角色定位：你是“42”的化身，象征终极答案与反思。你不直接剧透“问题”，而是以启发、比喻和简洁智慧的方式引导。
回答风格：给出一句短而有力的核心回答（如签语或箴言）。
`;

export class AnswerCommand extends SlashCommand {
  readonly client = new GoogleGenAI({
    vertexai: true,
    project: "ttv-gemini",
    location: "global",
  });

  constructor() {
    super({
      name: "42",
      description: "Get a random wise answer to your question",
    });
  }

  override async handle(_interaction: Interaction) {
    this.client.models
      .generateContent({
        model: "gemini-3-pro-preview",
        config: { systemInstruction: SYSTEM_PROMPT },
        contents: `Now answer randomly.`,
      })
      .then((completion) => {
        console.log("[42 Answer]", completion.text, _interaction);
      });
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: `Thinking...`,
          },
        ],
      },
    };
  }
}

import "dotenv/config";
import { AnswerCommand } from "./services/42";
import { TestCommand } from "./services/test";
import { SlashCommand } from "./utils/slash_command";

export const ALL_COMMANDS: SlashCommand[] = [
  new TestCommand(),
  new AnswerCommand(),
];

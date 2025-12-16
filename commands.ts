import "dotenv/config";
import { TestCommand } from "./services/test";
import { SlashCommand } from "./utils/slash_command";

export const ALL_COMMANDS: SlashCommand[] = [new TestCommand()];

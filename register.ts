import { ALL_COMMANDS } from "./commands";
import { InstallGlobalCommands } from "./utils/request";

const APP_ID = process.env.APP_ID;
if (!APP_ID) {
  console.error("Missing APP_ID in environment variables");
  process.exit(1);
}

InstallGlobalCommands(APP_ID, ALL_COMMANDS);

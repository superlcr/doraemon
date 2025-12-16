export type LocalizationMap = Partial<Record<string, string>>;

export enum ChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
  GUILD_ANNOUNCEMENT = 5,
  ANNOUNCEMENT_THREAD = 10,
  PUBLIC_THREAD = 11,
  PRIVATE_THREAD = 12,
  GUILD_STAGE_VOICE = 13,
  GUILD_DIRECTORY = 14,
  GUILD_FORUM = 15,
  GUILD_MEDIA = 16,
}

export enum SlashCommandOptionType {
  SUB_COMMAND = 1,
  SUB_COMMAND_GROUP = 2,
  STRING = 3,
  INTEGER = 4,
  BOOLEAN = 5,
  USER = 6,
  CHANNEL = 7,
  ROLE = 8,
  MENTIONABLE = 9,
  NUMBER = 10,
  ATTACHMENT = 11,
}

export interface SlashCommandOptionChoice {
  name: string;
  name_localizations?: LocalizationMap;
  value: string | number;
}

export interface SlashCommandOption {
  /** Type of command, defaults to 1 */
  type: SlashCommandOptionType;

  /** Name of command, 1-32 characters */
  name: string;

  /** Localization dictionary for name field */
  name_localizations?: LocalizationMap;

  /**
   * Description for CHAT_INPUT commands, 1-100 characters.
   * Empty string for USER and MESSAGE commands.
   */
  description: string;

  /** Localization dictionary for description field */
  description_localizations?: LocalizationMap;

  /** Whether the parameter is required or optional, default false */
  required?: boolean;

  /** If the option is a subcommand or subcommand group, these are the nested options */
  choices?: SlashCommandOptionChoice[];

  /** If the option is a subcommand or subcommand group, these are the nested options */
  options?: SlashCommandOption[];

  /** Channel types the command is available in */
  channel_types?: ChannelType[];

  /** Minimum value for numeric options */
  min_value?: number;

  /** Maximum value for numeric options */
  max_value?: number;

  /** Minimum length for string options */
  min_length?: number;

  /** Maximum length for string options */
  max_length?: number;

  /** Whether the option is autocomplete */
  autocomplete?: boolean;
}

export interface SlashCommandMetadata {
  /** Name of command, 1-32 characters */
  name: string;

  /** Localization dictionary for name field */
  name_localizations?: LocalizationMap;

  /**
   * Description for CHAT_INPUT commands, 1-100 characters.
   * Empty string for USER and MESSAGE commands.
   */
  description: string;

  /** Localization dictionary for description field */
  description_localizations?: LocalizationMap;

  /** Options for command */
  options?: SlashCommandOption[];
}

export interface Interaction {
  // TODO: https://discord.com/developers/docs/interactions/receiving-and-responding
}

export interface InteractionResponse {
  // TODO: https://discord.com/developers/docs/interactions/receiving-and-responding
}

export abstract class SlashCommand {
  constructor(metadata: SlashCommandMetadata) {
    this.metadata = metadata;
  }

  readonly metadata: SlashCommandMetadata;

  abstract handle(interaction: Interaction): Promise<InteractionResponse>;

  protected listen(component_ids: string[]) {
    this._component_ids.push(...component_ids);
  }

  get component_ids() {
    return this._component_ids;
  }

  private _component_ids: string[] = [];
}

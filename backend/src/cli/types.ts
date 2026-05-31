export type FlagValue = boolean | string | string[];

export type ParsedArgs = {
  positionals: string[];
  flags: Record<string, FlagValue>;
  passthrough: string[];
};

export type Column = {
  key: string;
  header: string;
  max?: number;
};

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

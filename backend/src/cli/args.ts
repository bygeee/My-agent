import type { FlagValue, ParsedArgs } from "./types.js";
import { CliError } from "./types.js";

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};
  const passthrough: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--") {
      passthrough.push(...argv.slice(index + 1));
      break;
    }
    if (token === "-h") {
      addFlag(flags, "help", true);
      continue;
    }
    if (token.startsWith("--") && token.length > 2) {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      if (equalsIndex >= 0) {
        addFlag(flags, withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1));
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        addFlag(flags, withoutPrefix, next);
        index += 1;
      } else {
        addFlag(flags, withoutPrefix, true);
      }
      continue;
    }
    if (isKeyValueToken(token)) {
      const equalsIndex = token.indexOf("=");
      addFlag(flags, token.slice(0, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags, passthrough };
}

export function flagString(parsed: ParsedArgs, name: string) {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return value.at(-1);
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

export function flagArray(parsed: ParsedArgs, name: string) {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

export function flagBool(parsed: ParsedArgs, name: string) {
  return parsed.flags[name] === true;
}

export function assignFlag(target: Record<string, unknown>, key: string, value: string | undefined) {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function requirePositional(parsed: ParsedArgs, index: number, message: string) {
  const value = parsed.positionals[index];
  if (!value) {
    throw new CliError(message);
  }
  return value;
}

function addFlag(flags: Record<string, FlagValue>, key: string, value: boolean | string) {
  const normalized = key.replace(/_/g, "-");
  const existing = flags[normalized];
  if (existing === undefined) {
    flags[normalized] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    return;
  }
  flags[normalized] = [String(existing), String(value)];
}

function isKeyValueToken(token: string) {
  const equalsIndex = token.indexOf("=");
  return equalsIndex > 0 && !token.startsWith("=") && !token.includes("://");
}

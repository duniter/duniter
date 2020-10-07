// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import { format } from "util";
import { RustLogger } from "../../neon/native";

export class Logger {
  logger: RustLogger | null = null;

  constructor() {}

  initLogger(home: string, level: string | undefined) {
    if (this.logger == null) {
      this.logger = new RustLogger(home, level || "info");
    }
  }

  changeLevel(level: string) {
    if (this.logger != null) {
      this.logger.changeLevel(level || "info");
    }
  }

  error(format_: any, ...param: any[]) {
    if (this.logger != null) {
      this.logger.error(format(format_, ...param));
    }
  }
  warn(format_: any, ...param: any[]) {
    if (this.logger != null) {
      this.logger.warn(format(format_, ...param));
    }
  }
  info(format_: any, ...param: any[]) {
    if (this.logger != null) {
      this.logger.info(format(format_, ...param));
    }
  }
  debug(format_: any, ...param: any[]) {
    if (this.logger != null) {
      this.logger.debug(format(format_, ...param));
    }
  }
  trace(format_: any, ...param: any[]) {
    if (this.logger != null) {
      this.logger.trace(format(format_, ...param));
    }
  }
}

const logger = new Logger();

/**
 * Convenience function to get logger directly
 */
export function NewLogger(name?: string): Logger {
  return logger;
}

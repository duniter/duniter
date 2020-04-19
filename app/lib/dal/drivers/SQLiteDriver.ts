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

import { OtherConstants } from "../../other_constants";
import { RealFS } from "../../system/directory";

const sqlite3 = require("sqlite3").verbose();

const MEMORY_PATH = ":memory:";

export class SQLiteDriver {
  private logger: any;
  private dbPromise: Promise<any> | null = null;

  constructor(private path: string) {
    this.logger = require("../../logger").NewLogger("driver");
  }

  getDB(): Promise<any> {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        this.logger.debug('Opening SQLite database "%s"...', this.path);
        let sqlite = new sqlite3.Database(this.path);
        await new Promise<any>((resolve) => sqlite.once("open", resolve));
        // Database is opened
        if (OtherConstants.SQL_TRACES) {
          sqlite.on("trace", (trace: any) => {
            this.logger.trace(trace);
          });
        }

        // Force case sensitiveness on LIKE operator
        const sql = "PRAGMA case_sensitive_like=ON";
        await new Promise<any>((resolve, reject) =>
          sqlite.exec(sql, (err: any) => {
            if (err)
              return reject(
                Error(
                  'SQL error "' +
                    err.message +
                    '" on INIT queries "' +
                    sql +
                    '"'
                )
              );
            return resolve();
          })
        );

        // Database is ready
        return sqlite;
      })();
    }
    return this.dbPromise;
  }

  async executeAll(sql: string, params: any[]): Promise<any[]> {
    const db = await this.getDB();
    return new Promise<any>((resolve, reject) =>
      db.all(sql, params, (err: any, rows: any[]) => {
        if (err) {
          return reject(
            Error('SQL error "' + err.message + '" on query "' + sql + '"')
          );
        } else {
          return resolve(rows);
        }
      })
    );
  }

  async executeSql(sql: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) =>
      db.exec(sql, (err: any) => {
        if (err) {
          return reject(
            Error('SQL error "' + err.message + '" on query "' + sql + '"')
          );
        } else {
          return resolve();
        }
      })
    );
  }

  async destroyDatabase(): Promise<void> {
    this.logger.debug("Removing SQLite database...");
    await this.closeConnection();
    if (this.path !== MEMORY_PATH) {
      await RealFS().fsUnlink(this.path);
    }
    this.logger.debug("Database removed");
  }

  async closeConnection(): Promise<void> {
    if (!this.dbPromise) {
      return;
    }
    const db = await this.getDB();
    if (process.platform === "win32") {
      db.open; // For an unknown reason, we need this line.
    }
    await new Promise((resolve, reject) => {
      this.logger.debug("Trying to close SQLite...");
      db.on("close", () => {
        this.logger.info("Database closed.");
        this.dbPromise = null;
        resolve();
      });
      db.on("error", (err: any) => {
        if (err && err.message === "SQLITE_MISUSE: Database is closed") {
          this.dbPromise = null;
          return resolve();
        }
        reject(err);
      });
      try {
        db.close();
      } catch (e) {
        this.logger.error(e);
        throw e;
      }
    });
  }
}

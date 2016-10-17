"use strict";

const co      = require('co');
const qfs     = require('q-io/fs');
const sqlite3 = require("sqlite3").verbose();

module.exports = function NewSqliteDriver(path) {
  return new SQLiteDriver(path);
};

const MEMORY_PATH = ':memory:';

function SQLiteDriver(path) {

  const logger  = require('../../logger')('driver');

  const that = this;
  let dbPromise = null;

  function getDB() {
    return dbPromise || (dbPromise = co(function*() {
        logger.debug('Opening SQLite database "%s"...', path);
        let sqlite = new sqlite3.Database(path);
        yield new Promise((resolve) => sqlite.once('open', resolve));
        // Database is opened and ready
        return sqlite;
    }));
  }

  this.executeAll = (sql, params) => co(function*() {
    const db = yield getDB();
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(rows);
      }
    }));
  });

  this.executeSql = (sql) => co(function*() {
    const db = yield getDB();
    return new Promise((resolve, reject) => db.exec(sql, (err) => {
      if (err) {
        return reject(err);
      } else {
        return resolve();
      }
    }));
  });

  this.destroyDatabase = () => co(function*() {
    logger.debug('Removing SQLite database...');
    yield that.closeConnection();
    if (path !== MEMORY_PATH) {
      yield qfs.remove(path);
    }
    logger.debug('Database removed');
  });

  this.closeConnection = () => co(function*() {
    if (!dbPromise) {
      return;
    }
    const db = yield getDB();
    if (process.platform === 'win32') {
      db.open; // For an unknown reason, we need this line.
    }
    yield new Promise((resolve, reject) => {
      logger.debug('Trying to close SQLite...');
      db.on('close', () => {
        logger.info('Database closed.');
        dbPromise = null;
        resolve();
      });
      db.on('error', (err) => {
        if (err && err.message === 'SQLITE_MISUSE: Database is closed') {
          dbPromise = null;
          return resolve();
        }
        reject(err);
      });
      db.close();
    });
  });
}
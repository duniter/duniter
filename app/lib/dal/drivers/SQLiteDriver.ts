const qfs     = require('q-io/fs')
const sqlite3 = require("sqlite3").verbose()

const MEMORY_PATH = ':memory:'

export class SQLiteDriver {

  private logger:any
  private dbPromise: Promise<any> | null = null

  constructor(
    private path:string
  ) {
    this.logger = require('../../logger').NewLogger('driver')
  }

  getDB(): Promise<any> {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        this.logger.debug('Opening SQLite database "%s"...', this.path)
        let sqlite = new sqlite3.Database(this.path)
        await new Promise<any>((resolve) => sqlite.once('open', resolve))
        // Database is opened

        // Force case sensitiveness on LIKE operator
        const sql = 'PRAGMA case_sensitive_like=ON'
        await new Promise<any>((resolve, reject) => sqlite.exec(sql, (err:any) => {
          if (err) return reject(Error('SQL error "' + err.message + '" on INIT queries "' + sql + '"'))
          return resolve()
        }))

        // Database is ready
        return sqlite
      })()
    }
    return this.dbPromise
  }

  async executeAll(sql:string, params:any[]): Promise<any[]> {
    const db = await this.getDB()
    return new Promise<any>((resolve, reject) => db.all(sql, params, (err:any, rows:any[]) => {
      if (err) {
        return reject(Error('SQL error "' + err.message + '" on query "' + sql + '"'))
      } else {
        return resolve(rows)
      }
    }))
  }

  async executeSql(sql:string): Promise<void> {
    const db = await this.getDB()
    return new Promise<void>((resolve, reject) => db.exec(sql, (err:any) => {
      if (err) {
        return reject(Error('SQL error "' + err.message + '" on query "' + sql + '"'))
      } else {
        return resolve()
      }
    }))
  }

  async destroyDatabase(): Promise<void> {
    this.logger.debug('Removing SQLite database...')
    await this.closeConnection()
    if (this.path !== MEMORY_PATH) {
      await qfs.remove(this.path)
    }
    this.logger.debug('Database removed')
  }

  async closeConnection(): Promise<void> {
    if (!this.dbPromise) {
      return
    }
    const db = await this.getDB()
    if (process.platform === 'win32') {
      db.open // For an unknown reason, we need this line.
    }
    await new Promise((resolve, reject) => {
      this.logger.debug('Trying to close SQLite...')
      db.on('close', () => {
        this.logger.info('Database closed.')
        this.dbPromise = null
        resolve()
      })
      db.on('error', (err:any) => {
        if (err && err.message === 'SQLITE_MISUSE: Database is closed') {
          this.dbPromise = null
          return resolve()
        }
        reject(err)
      })
      try {
        db.close()
      } catch (e) {
        this.logger.error(e)
        throw e
      }
    })
  }
}

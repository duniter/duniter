import {SqlFieldDefinition} from "./SqlFieldDefinition"
import {Underscore} from "../../../common-libs/underscore"
import {SqliteNodeIOManager} from "./SqliteNodeIOManager"
import {SQLiteDriver} from "../../drivers/SQLiteDriver"

export class SqliteTable<T> {

  private readonly pdriver: Promise<SQLiteDriver>
  protected driver: SqliteNodeIOManager<T>

  protected constructor(
    protected name: string,
    protected fields: {
      [k in keyof T]?: SqlFieldDefinition
    },
    getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>
    ) {
    this.pdriver = getSqliteDB(`${name}.db`)
  }

  async init(): Promise<void> {
    this.driver = new SqliteNodeIOManager(await this.pdriver, 'sindex')
    await this.driver.sqlExec(`
    BEGIN;
    ${this.generateCreateTable()};
    ${this.generateCreateIndexes()};
    COMMIT;
    `)
  }

  async close(): Promise<void> {
    await this.driver.close()
  }

  generateCreateTable() {
    let sql = `CREATE TABLE IF NOT EXISTS ${this.name} (`
    const fields = this.keys().map(fieldName => {
      const f = this.fields[fieldName] as SqlFieldDefinition
      switch (f.type) {
        case 'BOOLEAN': return `\n${fieldName} BOOLEAN${f.nullable ? ' NULL' : ''}`
        case 'CHAR':    return `\n${fieldName} CHAR(${f.length})${f.nullable ? ' NULL' : ''}`
        case 'VARCHAR': return `\n${fieldName} VARCHAR(${f.length})${f.nullable ? ' NULL' : ''}`
        case 'TEXT':    return `\n${fieldName} TEXT${f.nullable ? ' NULL' : ''}`
        case 'JSON':    return `\n${fieldName} TEXT${f.nullable ? ' NULL' : ''}`
        case 'INT':     return `\n${fieldName} INT${f.nullable ? ' NULL' : ''}`
      }
    }).join(', ')
    sql += `${fields});`
    return sql
  }

  generateCreateIndexes() {
    return this.keys().map(fieldName => {
      return `CREATE INDEX IF NOT EXISTS idx_${this.name}_${fieldName} ON ${this.name} (${fieldName});\n`
    }).join('')
  }

  keys(): (keyof T)[] {
    return Underscore.keys(this.fields)
  }

  async insertInTable(driver: SqliteNodeIOManager<T>, record: T) {
    return this.insertBatchInTable(driver, [record])
  }

  async update<K extends keyof T>(driver: SqliteNodeIOManager<T>, record: T, fieldsToUpdate: K[], whereFields: K[]) {
    const valuesOfRecord = fieldsToUpdate.map(fieldName => `${fieldName} = ${this.getFieldValue(fieldName, record)}`).join(',')
    const conditionsOfRecord = whereFields.map(fieldName => `${fieldName} = ${this.getFieldValue(fieldName, record)}`).join(',')
    await driver.sqlWrite(`UPDATE ${this.name} SET ${valuesOfRecord} WHERE ${conditionsOfRecord};`, [])
  }

  async insertBatchInTable(driver: SqliteNodeIOManager<T>, records: T[]) {
    const keys = this.keys()
    const values = records.map(r => '(' + keys.map(fieldName => this.getFieldValue(fieldName, r)).join(',') + ')').join(',')
    let sql = `INSERT INTO ${this.name} (
    ${keys.join(',')}
    ) VALUES ${values};`
    await driver.sqlWrite(sql, [])
  }

  async findEntities(sql: string, params: any[]): Promise<T[]> {
    const keys = this.keys()
    return (await this.driver.sqlRead(sql, params)).map(r => {
      const newValue: any = {}
      keys.forEach(k => newValue[k] = this.sqlValue2Object(k, r))
      return newValue
    })
  }

  /**
   * Extract an SQL value of a field into its Object value
   * @param {keyof T} fieldName Name of the field in the record.
   * @param {T} record The record from which extracting a column's value.
   * @returns {any} The translated value.
   */
  protected sqlValue2Object<K extends keyof T>(fieldName: K, record: T): any {
    const def = this.fields[fieldName] as SqlFieldDefinition
    const value = record[fieldName] as any
    switch (def.type) {
      case "CHAR":
      case "VARCHAR":
      case "TEXT":
        return value
      case "JSON":
        return value === null ? value : JSON.parse(value)
      case "BOOLEAN":
        return value === null ? null : (!!value)
      case "INT":
        return value === null ? null : value
    }
  }

  private getFieldValue(fieldName: keyof T, record: T) {
    const def = this.fields[fieldName] as SqlFieldDefinition
    const value = record[fieldName]
    switch (def.type) {
      case "CHAR":
      case "VARCHAR":
      case "TEXT":
        if (!def.nullable) {
          return `'${value}'`
        }
        else {
          return value !== null && value !== undefined ?
            `'${value}'` :
            'null'
        }
      case "JSON":
        if (!def.nullable) {
          return `'${JSON.stringify(value)}'`
        }
        else {
          return value !== null && value !== undefined ?
            `'${JSON.stringify(value)}'` :
            'null'
        }
      case "BOOLEAN":
        if (!def.nullable) {
          return `${value ? 1 : 0}`
        }
        else {
          return value !== null && value !== undefined ?
            `${value ? 1 : 0}` :
            'null'
        }
      case "INT":
        if (!def.nullable) {
          return `${value || 0}`
        }
        else {
          return value !== null && value !== undefined ?
            `${value}` :
            'null'
        }
    }
  }

  async dump() {
    const ts: T[] = await this.findEntities(`SELECT * FROM ${this.name}`, [])
    ts.forEach(t => console.log(t))
  }

  async count() {
    return ((await this.driver.sqlRead(`SELECT COUNT(*) as max FROM ${this.name}`, []))[0] as any).max
  }

  /**
   * Debugging function: allows to make a hot copy of an SQLite database to a new file, even if the source is in-memory.
   * @param {string} path The path where to write the copy.
   * @returns {Promise<void>} Promise of done.
   */
  async copy2file(path: string) {
    const copy = new SqliteTable<T>(this.name, this.fields, async () => new SQLiteDriver(path))
    await copy.init()
    await copy.insertBatchInTable(this.driver, await this.driver.sqlRead(`SELECT * FROM ${this.name}`, []))
  }
}

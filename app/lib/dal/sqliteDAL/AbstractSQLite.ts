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

import {SQLiteDriver} from "../drivers/SQLiteDriver"
import {Initiable} from "./Initiable"
import {Underscore} from "../../common-libs/underscore"
import {NewLogger} from "../../logger"
import {MonitorSQLExecutionTime} from "../../debug/MonitorSQLExecutionTime"

const logger = NewLogger('sqlite')

export interface BeforeSaveHook<T> {
  (t:T): void
}

export abstract class AbstractSQLite<T> extends Initiable {

  constructor(
    private driver:SQLiteDriver,
    public readonly table: string,
    private pkFields: string[] = [],
    protected fields: string[] = [],
    private arrays: string[] = [],
    private booleans: string[] = [],
    private bigintegers: string[] = [],
    private transientFields: string[] = [],
    private beforeSaveHook: BeforeSaveHook<T> | null = null
  ) {
    super()
  }

  @MonitorSQLExecutionTime()
  async query(sql:string, params: any[] = []): Promise<T[]> {
    try {
      const res = await this.driver.executeAll(sql, params || []);
      return res.map((t:T) => this.toEntity(t))
    } catch (e) {
      logger.error('ERROR >> %s', sql, JSON.stringify(params || []), e.stack || e.message || e);
      throw e;
    }
  }

  cleanData(): Promise<void> {
    return this.exec("DELETE FROM " + this.table)
  }

  sqlListAll(): Promise<T[]> {
    return this.query("SELECT * FROM " + this.table)
  }

  sqlDeleteAll() {
    return this.cleanData()
  }

  sqlFind(obj:any, sortObj:any = {}): Promise<T[]> {
    const conditions = this.toConditionsArray(obj).join(' and ');
    const values = this.toParams(obj);
    const sortKeys: string[] = Underscore.keys(sortObj)
    const sort = sortKeys.length ? ' ORDER BY ' + sortKeys.map((k) => "`" + k + "` " + (sortObj[k] ? 'DESC' : 'ASC')).join(',') : '';
    return this.query('SELECT * FROM ' + this.table + ' WHERE ' + conditions + sort, values);
  }

  async sqlFindOne(obj:any, sortObj:any = null): Promise<T> {
    const res = await this.sqlFind(obj, sortObj)
    return res[0]
  }

  sqlFindLikeAny(obj:any): Promise<T[]> {
    const keys:string[] = Underscore.keys(obj)
    return this.query('SELECT * FROM ' + this.table + ' WHERE ' + keys.map((k) => 'UPPER(`' + k + '`) like ?').join(' or '), keys.map((k) => obj[k].toUpperCase()))
  }

  async sqlRemoveWhere(obj:any): Promise<void> {
    const keys:string[] = Underscore.keys(obj)
    await this.query('DELETE FROM ' + this.table + ' WHERE ' + keys.map((k) => '`' + k + '` = ?').join(' and '), keys.map((k) => obj[k]))
  }

  sqlExisting(entity:T): Promise<T> {
    return this.getEntity(entity)
  }

  async saveEntity(entity:any): Promise<void> {
    let toSave:any = entity;
    if (this.beforeSaveHook) {
      this.beforeSaveHook(toSave);
    }
    const existing = await this.getEntity(toSave);
    if (existing) {
      toSave = this.toRow(toSave);
      const valorizations = this.fields.map((field) => '`' + field + '` = ?').join(', ');
      const conditions = this.getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
      const setValues = this.fields.map((field) => toSave[field]);
      const condValues = this.getPKFields().map((k) => toSave[k]);
      await this.query('UPDATE ' + this.table + ' SET ' + valorizations + ' WHERE ' + conditions, setValues.concat(condValues));
      return
    }
    await this.insert(toSave);
  }

  async insert(entity:T): Promise<void> {
    const row = this.toRow(entity);
    const values = this.fields.map((f) => row[f]);
    await this.query(this.getInsertQuery(), values)
  }

  async getEntity(entity:any): Promise<T> {
    const conditions = this.getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    const params = this.toParams(entity, this.getPKFields());
    return (await this.query('SELECT * FROM ' + this.table + ' WHERE ' + conditions, params))[0];
  }

  async deleteEntity(entity:any): Promise<void> {
    const toSave = this.toRow(entity);
    if (this.beforeSaveHook) {
      this.beforeSaveHook(toSave);
    }
    const conditions = this.getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    const condValues = this.getPKFields().map((k) => toSave[k]);
    await this.query('DELETE FROM ' + this.table + ' WHERE ' + conditions, condValues)
  }

  @MonitorSQLExecutionTime()
  async exec(sql:string) {
    await this.driver.executeSql(sql)
  }

  getInsertQuery(): string {
    return "INSERT INTO " + this.table + " (" + this.fields.map(f => '`' + f + '`').join(',') + ") VALUES (" + "?,".repeat(this.fields.length - 1) + "?);"
  }

  getInsertHead(): string {
    const valuesKeys = this.fields
    return 'INSERT INTO ' + this.table + " (" + valuesKeys.map(f => '`' + f + '`').join(',') + ") VALUES ";
  }

  getInsertValue(toSave:T): string {
    if (this.beforeSaveHook) {
      this.beforeSaveHook(toSave);
    }
    const row = this.toRow(toSave);
    const valuesKeys = this.fields
    const values = valuesKeys.map((field) => this.escapeToSQLite(row[field]));
    return "(" + values.join(',') + ")";
  }

  toInsertValues(entity:T): string {
    const row = this.toRow(entity);
    const values = this.fields.map((f) => row[f]);
    const formatted = values.map((s:string) => this.escapeToSQLite(s))
    return "(" + formatted.join(',') + ")";
  }

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  async insertBatch(records:T[]): Promise<void> {
    const queries = [];
    if (records.length) {
      const insert = this.getInsertHead();
      const values = records.map((src) => this.getInsertValue(src));
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      await this.exec(queries.join('\n'))
    }
  }

  /**
   * To redefine if necessary in subclasses.
   */
  cleanCache() {
  }

  async close(): Promise<void> {
    // Does nothing: the SqliteDriver is shared among all instances, we close it in a single time in fileDAL.close()
  }

  private toConditionsArray(obj:any): string[] {
    return Underscore.keys(obj).map((k:string) => {
      if (obj[k].$lte !== undefined) {
        return '`' + k + '` <= ?';
      } else if (obj[k].$gte !== undefined) {
        return '`' + k + '` >= ?';
      } else if (obj[k].$gt !== undefined) {
        return '`' + k + '` > ?';
      }  else if (obj[k].$lt !== undefined) {
        return '`' + k + '` < ?';
      }  else if (obj[k].$null !== undefined) {
        return '`' + k + '` IS ' + (!obj[k].$null ? 'NOT' : '') + ' NULL';
      }  else if (obj[k].$contains !== undefined) {
        return '`' + k + '` LIKE ?';
      } else {
        return '`' + k + '` = ?';
      }
    });
  }

  private toParams(obj:any, fields:string[] | null = null): any[] {
    let params:any[] = [];
    (fields || Underscore.keys(obj)).forEach((f:string) => {
      if (obj[f].$null === undefined) {
        let pValue;
        if      (obj[f].$lte  !== undefined)      { pValue = obj[f].$lte;  }
        else if (obj[f].$gte  !== undefined)      { pValue = obj[f].$gte;  }
        else if (obj[f].$gt   !== undefined)      { pValue = obj[f].$gt;   }
        else if (obj[f].$lt   !== undefined)      { pValue = obj[f].$lt;   }
        else if (obj[f].$null !== undefined)      { pValue = obj[f].$null; }
        else if (obj[f].$contains !== undefined) { pValue = "%" + obj[f].$contains + "%"; }
        else if (~this.bigintegers.indexOf(f) && typeof obj[f] !== "string") {
          pValue = String(obj[f]);
        } else {
          pValue = obj[f];
        }
        params.push(pValue);
      }
    });
    return params;
  }

  private escapeToSQLite(val:string): any {
    if (typeof val == "boolean") {
      // SQLite specific: true => 1, false => 0
      if (val !== null && val !== undefined) {
        return val ? 1 : 0;
      } else {
        return null;
      }
    }
    else if (typeof val == "string") {
      return "'" + val.replace(/'/g, "\\'") + "'";
    }
    else if (val === undefined) {
      return "null";
    } else {
      return JSON.stringify(val);
    }
  }

  private getPKFields(): string[] {
    return this.pkFields
  }

  private toEntity(row:any): T {
    for (const arr of this.arrays) {
      row[arr] = row[arr] ? JSON.parse(row[arr]) : [];
    }
    // Big integers are stored as strings to avoid data loss
    for (const bigint of this.bigintegers) {
      if (row[bigint] !== null && row[bigint] !== undefined) {
        row[bigint] = parseInt(row[bigint]);
      }
    }
    // Booleans
    for (const f of this.booleans) {
      row[f] = row[f] !== null ? Boolean(row[f]) : null;
    }
    // Transient
    for (const f of (this.transientFields || [])) {
      row[f] = row[f];
    }
    return row;
  }

  private toRow(entity:any): any {
    let row:any = {};
    for (const f of this.fields) {
      row[f] = entity[f]
    }
    for (const arr of this.arrays) {
      row[arr] = JSON.stringify(row[arr] || []);
    }
    // Big integers are stored as strings to avoid data loss
    for (const bigint of this.bigintegers) {
      if (entity[bigint] === null || entity[bigint] === undefined) {
        row[bigint] = null;
      } else {
        row[bigint] = String(entity[bigint]);
      }
    }
    return row;
  }
}

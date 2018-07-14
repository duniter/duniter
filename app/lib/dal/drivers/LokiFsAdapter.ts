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

import {FileSystem} from "../../system/directory"
import {DataErrors} from "../../common-libs/errors"
import {CFSCore} from "../fileDALs/CFSCore"
import {getNanosecondsTime} from "../../../ProcessCpuProfiler"
import {NewLogger} from "../../logger"

export interface Iterator<T> {
  next(value?: any): IteratorResult<T>
  return?(value?: any): IteratorResult<T>
  throw?(e?: any): IteratorResult<T>
}

export interface IteratorResult<T> {
  done: boolean
  value: T
}

export interface DBCommit {
  indexFile:string,
  changes: string[]
  collections: {
    [coll:string]: string
  }
}

export class LokiFsAdapter {

  private static COMMIT_FILE = "commit.json"
  private cfs:CFSCore

  protected mode = "reference"
  protected dbref = null
  protected dirtyPartitions: string[] = [];

  constructor(dbDir:string, fs:FileSystem) {
    this.cfs = new CFSCore(dbDir, fs)
  }

  /**
   * Main method to manually pilot the full DB saving to disk.
   * @param loki
   * @returns {Promise}
   */
  async dbDump(loki:any) {
    return new Promise(res => loki.saveDatabaseInternal(res))
  }

  async listPendingChanges(): Promise<string[]> {
    if (!(await this.cfs.exists(LokiFsAdapter.COMMIT_FILE))) {
      return []
    }
    const commitObj = await this.cfs.readJSON(LokiFsAdapter.COMMIT_FILE)
    return commitObj.changes
  }

  /**
   * Flushes the DB changes to disk.
   * @param loki
   * @returns {Promise<number>} The number of changes detected.
   */
  async flush(loki:any): Promise<number> {
    // If the database already has a commit file: incremental changes
    if (await this.cfs.exists(LokiFsAdapter.COMMIT_FILE)) {
      const commit = (await this.cfs.readJSON(LokiFsAdapter.COMMIT_FILE)) as DBCommit
      const changesFilename = 'changes.' + getNanosecondsTime() + ".json"
      const changes = JSON.parse(loki.serializeChanges())
      await this.cfs.writeJSON(changesFilename, changes)
      // Mark the changes as commited
      commit.changes.push(changesFilename)
      await this.cfs.writeJSON(LokiFsAdapter.COMMIT_FILE, commit)
      // Forget about the changes now that we saved them
      loki.clearChanges()
      return changes.length
    } else {
      // Otherwise we make a full dump
      await this.dbDump(loki)
      loki.clearChanges()
      return 0
    }
  }

  /**
   *
   * Method indirectly called by `flush`.
   *
   * Loki reference adapter interface function.  Saves structured json via loki database object reference.
   *
   * @param {string} dbname - the name to give the serialized database within the catalog.
   * @param {object} dbref - the loki database object reference to save.
   * @param {function} callback - callback passed obj.success with true or false
   * @memberof LokiFsStructuredAdapter
   */
  public async exportDatabase(dbname:string, dbref:any, callback:any) {

    this.dbref = dbref

    // create (dirty) partition generator/iterator
    let pi = this.getPartition()

    // Prepare the commit: inherit from existing commit
    let commit:DBCommit = {
      indexFile: 'index.db.' + getNanosecondsTime() + ".json",
      changes: [],
      collections: {}
    }
    if (await this.cfs.exists(LokiFsAdapter.COMMIT_FILE)) {
      commit.collections = ((await this.cfs.readJSON(LokiFsAdapter.COMMIT_FILE)) as DBCommit).collections
    }

    // Eventually create the tree
    await this.cfs.makeTree('/')

    this.saveNextPartition(commit, pi, async () => {

      // Write the new commit file. If the process gets interrupted during this phase, the DB will likely get corrupted.
      await this.cfs.writeJSON(LokiFsAdapter.COMMIT_FILE, commit)

      const remainingFiles = [
        LokiFsAdapter.COMMIT_FILE,
        commit.indexFile
      ].concat(Object.keys(commit.collections).map(k => commit.collections[k]))

      // Clean obsolete DB files
      const list = await this.cfs.list('/')
      for (const f of list) {
        if (remainingFiles.indexOf(f) === -1) {
          await this.cfs.remove(f)
        }
      }

      // Finish
      callback(null)
    })
  }

  /**
   * Generator for yielding sequence of dirty partition indices to iterate.
   *
   * @memberof LokiFsStructuredAdapter
   */
  private *getPartition(): Iterator<string> {
    let idx,
      clen = (this.dbref as any).collections.length

    // since database container (partition -1) doesn't have dirty flag at db level, always save
    yield "";

    // yield list of dirty partitions for iterateration
    for(idx=0; idx<clen; idx++) {
      const coll:any = (this.dbref as any).collections[idx]
      if (coll.dirty) {
        yield coll.name
      }
    }
  }

  /**
   * Utility method for queueing one save at a time
   */
  private async saveNextPartition(commit:DBCommit, pi:Iterator<string>, callback:any) {
    let li;
    let filename;
    let self = this;
    let pinext = pi.next();

    if (pinext.done) {
      callback();
      return;
    }

    // db container (partition -1) uses just dbname for filename,
    // otherwise append collection array index to filename
    filename = (pinext.value === "") ? commit.indexFile : ((pinext.value + "." + getNanosecondsTime()) + ".json")

    // We map the collection name to a particular file
    if (pinext.value) {
      commit.collections[pinext.value] = filename
    }

    li = this.generateDestructured({ partition: pinext.value });

    // iterate each of the lines generated by generateDestructured()
    await this.cfs.fsStreamTo(filename, li)

    self.saveNextPartition(commit, pi, callback)
  };

  /**
   * Generator for constructing lines for file streaming output of db container or collection.
   *
   * @param {object=} options - output format options for use externally to loki
   * @param {int=} options.partition - can be used to only output an individual collection or db (-1)
   *
   * @returns {string|array} A custom, restructured aggregation of independent serializations.
   * @memberof LokiFsStructuredAdapter
   */
  *generateDestructured(options = { partition: "" }) {
    let idx
    let dbcopy;

    // if partition is -1 we will return database container with no data
    if (options.partition === "") {
      // instantiate lightweight clone and remove its collection data
      dbcopy = (this.dbref as any).copy();

      for(idx=0; idx < dbcopy.collections.length; idx++) {
        dbcopy.collections[idx].data = [];
        dbcopy.collections[idx].changes = [];
      }

      yield dbcopy.serialize({
        serializationMethod: "normal"
      });

      return;
    }

    // 'partitioned' along with 'partition' of 0 or greater is a request for single collection serialization
    if (options.partition) {
      let doccount,
        docidx;

      // dbref collections have all data so work against that
      const coll = (this.dbref as any).collections.filter((c:any) => c.name === options.partition)[0]
      doccount = coll.data.length;

      for(docidx=0; docidx<doccount; docidx++) {
        yield JSON.stringify(coll.data[docidx]);
      }

      if (doccount === 0) {
        yield ''
      }
    }
  };

  /**
   *
   * Automatically called on startup.
   *
   * Loki persistence adapter interface function which outputs un-prototype db object reference to load from.
   *
   * @memberof LokiFsStructuredAdapter
   */
  public async loadDatabase(loki:any) {
    let instream,
      outstream,
      rl,
      self=this;

    this.dbref = null;

    // Load the database according to the commit file (lock for valid DB files)
    let commitObj:DBCommit
    if (!(await this.cfs.exists(LokiFsAdapter.COMMIT_FILE))) {
      return
    }
    commitObj = await this.cfs.readJSON(LokiFsAdapter.COMMIT_FILE)

    // make sure file exists
    const dbname = commitObj.indexFile

    // Trimmed data first
    if (await this.cfs.exists(dbname)) {
      const line = await this.cfs.read(dbname)
      // it should single JSON object (a one line file)
      if (self.dbref === null && line) {
        self.dbref = JSON.parse(line)
      }

      // when that is done, examine its collection array to sequence loading each
      if ((self.dbref as any).collections.length > 0) {
        await self.loadNextCollection(commitObj.collections, 0)
        loki.loadJSONObject(self.dbref)
      }
    } else {
      // file does not exist, we throw as the commit file is not respected
      throw Error(DataErrors[DataErrors.CORRUPTED_DATABASE])
    }

    // Changes data
    for (const changeFile of commitObj.changes) {
      const changes = await this.cfs.readJSON(changeFile)
      let len = changes.length
      for (let i = 1; i <= len; i++) {
        const c = changes[i - 1]
        const coll = loki.getCollection(c.name)
        if (c.operation === 'I') {
          c.obj.$loki = undefined
          await coll.insert(c.obj)
        }
        else if (c.operation === 'U') {
          await coll.update(c.obj)
        }
        else if (c.operation === 'R') {
          await coll.remove(c.obj)
        }
        NewLogger().trace('[loki] Processed change %s (%s/%s)', c.name, i, len)
      }
    }
  };


  /**
   * Recursive function to chain loading of each collection one at a time.
   * If at some point i can determine how to make async driven generator, this may be converted to generator.
   *
   * @param {object} collectionsMap - Map between the names of the collections and their matching file of the filesystem.
   * @param {int} collectionIndex - the ordinal position of the collection to load.
   * @param {function} callback - callback to pass to next invocation or to call when done
   * @memberof LokiFsStructuredAdapter
   */
  async loadNextCollection(collectionsMap:{ [coll:string]: string }, collectionIndex:any) {
    let self=this,
      obj;
    const coll = (self.dbref as any).collections[collectionIndex]
    if (!collectionsMap[coll.name] || !(await this.cfs.exists(collectionsMap[coll.name]))) {
      throw Error(DataErrors[DataErrors.CORRUPTED_DATABASE])
    }
    const filename = collectionsMap[coll.name]
    const content = await this.cfs.read(filename)
    if (content) {
      const lines = content.split('\n')
      for (const line of lines) {
        if (line !== "") {
          obj = JSON.parse(line);
          coll.data.push(obj);
        }
      }
    }

    // if there are more collections, load the next one
    if (++collectionIndex < (self.dbref as any).collections.length) {
      await self.loadNextCollection(collectionsMap, collectionIndex)
    }
  };
}
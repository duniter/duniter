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

"use strict";

const _ = require('underscore');
const path = require('path');

const DEEP_WRITE = true;

export class CFSCore {

  private deletedFolder:string
  private deletionFolderPromise: Promise<any> | null
  private createDeletionFolder: () => Promise<any> | null

  constructor(private rootPath:string, private qfs:any) {
    this.deletedFolder = path.join(rootPath, '.deleted')
    this.deletionFolderPromise = null

    /**
     * Creates the deletion folder before effective deletion.
     * @returns {*|any|Promise<void>} Promise of creation.
     */
    this.createDeletionFolder = () => this.deletionFolderPromise || (this.deletionFolderPromise = this.makeTree('.deleted'))
  }

  /**
   * READ operation of CFS. Reads given file. May lead to tree traversal if file is not found.
   * @param filePath Path to the file.
   * @returns {*} Promise for file content.
   */
  async read(filePath:string): Promise<string | null> {
    try {
      const isDeleted = await this.qfs.exists(path.join(this.deletedFolder, this.toRemoveFileName(filePath)));
      if (isDeleted) {
        // A deleted file must be considered non-existant
        return null;
      }
      return await this.qfs.read(path.join(this.rootPath, filePath));
    } catch (e) {
      return null
    }
  }

  /**
   * READ operation of CFS. Reads given file. May lead to tree traversal if file is not found.
   * @param filePath Path to the file.
   * @returns {*} Promise for file content.
   */
  async exists(filePath:string): Promise<boolean | null> {
    try {
      const isDeleted = await this.qfs.exists(path.join(this.deletedFolder, this.toRemoveFileName(filePath)));
      if (isDeleted) {
        // A deleted file must be considered non-existant
        return false;
      }
      return await this.qfs.exists(path.join(this.rootPath, filePath))
    } catch (e) {
      return null
    }
  }

  /**
   * LIST operation of CFS. List files at given location. Tree traversal.
   * @param ofPath Location folder to list files.
   * @param localLevel Limit listing to local level.
   * @returns {*} Promise of file names.
   */
  async list(ofPath:string): Promise<string[]> {
    const dirPath = path.normalize(ofPath);
    let files: string[] = [], folder = path.join(this.rootPath, dirPath);
    const hasDir = await this.qfs.exists(folder);
    if (hasDir) {
      files = files.concat(await this.qfs.list(folder));
    }
    const hasDeletedFiles = await this.qfs.exists(this.deletedFolder);
    if (hasDeletedFiles) {
      const deletedFiles = await this.qfs.list(this.deletedFolder);
      const deletedOfThisPath = deletedFiles.filter((f:string) => f.match(new RegExp('^' + this.toRemoveDirName(dirPath))));
      const locallyDeletedFiles = deletedOfThisPath.map((f:string) => f.replace(this.toRemoveDirName(dirPath), '')
        .replace(/^__/, ''));
      files = _.difference(files, locallyDeletedFiles);
    }
    return _.uniq(files);
  };

  /**
   * WRITE operation of CFS. Writes the file in local Core.
   * @param filePath Path to the file to write.
   * @param content String content to write.
   * @param deep Wether to make a deep write or not.
   */
  async write(filePath:string, content:string, deep:boolean): Promise<void> {
    return this.qfs.write(path.join(this.rootPath, filePath), content);
  };

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @param deep Wether to remove the file in the root core or not.
   * @returns {*} Promise of removal.
   */
  async remove(filePath:string, deep = false): Promise<void> {
    // Make a deep physical deletion
    // Root core: physical deletion
    return this.qfs.remove(path.join(this.rootPath, filePath));
  }

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @returns {*} Promise of removal.
   */
  removeDeep(filePath:string) {
    return this.remove(filePath, DEEP_WRITE)
  }

  /**
   * Create a directory tree.
   * @param treePath Tree path to create.
   */
  async makeTree(treePath:string) {
    // Note: qfs.makeTree does not work on windows, so we implement it manually
    try {
      let normalized = path.normalize(treePath);
      let folders = normalized.split(path.sep);
      let folder = this.rootPath;
      for (let i = 0, len = folders.length; i < len; i++) {
        folder = folder ? path.join(folder, folders[i]) : folders[i];
        let exists = await this.qfs.exists(folder);
        if (!exists) {
          await this.qfs.makeDirectory(folder);
        }
      }
    } catch (e) {
      if (e && e.code !== "EISDIR" && e.code !== "EEXIST") throw e;
    }
  }

  /**
   * Write JSON object to given file.
   * @param filePath File path.
   * @param content JSON content to stringify and write.
   * @param deep Wether to make a deep write or not.
   */
  writeJSON(filePath:string, content:any, deep:boolean = false) {
    return this.write(filePath, JSON.stringify(content, null, ' '), deep)
  }

  /**
   * Write JSON object to given file deeply in the core structure.
   * @param filePath File path.
   * @param content JSON content to stringify and write.
   */
  writeJSONDeep(filePath:string, content:any) {
    return this.writeJSON(filePath, content, DEEP_WRITE)
  }

  /**
   * Read a file and parse its content as JSON.
   * @param filePath File to read.
   */
  async readJSON(filePath:string) {
    let data:any;
    try {
      data = await this.read(filePath);
      return JSON.parse(data);
    } catch(err) {
      if (data && err.message.match(/^Unexpected token {/)) {
        // This is a bug thrown during Unit Tests with MEMORY_MODE true...
        return JSON.parse(data.match(/^(.*)}{.*/)[1] + '}');
      } else if (err.message.match(/^Unexpected end of input/)) {
        // Could not read, return empty object
        return {};
      }
      throw err;
    }
  }

  /**
   * Read contents of files at given path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   * @param localLevel Wether to read only local level or not.
   */
  listJSON(dirPath:string) {
    return this.list(dirPath).then(async (files) => Promise.all(files.map((f:string) => this.readJSON(path.join(dirPath, f)))))
  }

  /**
   * Read contents of files at given LOCAL path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   */
  listJSONLocal(dirPath:string) {
    return this.listJSON(dirPath)
  }

  /**
   * Normalize the path of a dir to be used for file deletion matching.
   * @param dirPath Directory path to normalize.
   * @returns {string|ng.ILocationService|XML} Normalized dir path.
   */
  private toRemoveDirName(dirPath:string) {
    if (!dirPath.match(/\/$/)) {
      dirPath += '/';
    }
    return path.normalize(dirPath).replace(/\//g, '__').replace(/\\/g, '__');
  }

  /**
   * Normalize the name of the deleted file.
   * @param filePath Full path of the file, included file name.
   * @returns {string|ng.ILocationService|XML} Normalized file name.
   */
  private toRemoveFileName(filePath:string) {
    return path.normalize(filePath).replace(/\//g, '__').replace(/\\/g, '__');
  }
}

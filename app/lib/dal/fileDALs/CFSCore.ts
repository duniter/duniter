"use strict";

const _ = require('underscore');
const path = require('path');

const LOCAL_LEVEL = true;
const DEEP_WRITE = true;

export class CFSCore {

  private deletedFolder:string
  private deletionFolderPromise: Promise<any> | null
  private createDeletionFolder: () => Promise<any> | null

  constructor(private rootPath:string, private qfs:any, private parent:CFSCore | null) {
    this.deletedFolder = path.join(rootPath, '.deleted')
    this.deletionFolderPromise = null

    /**
     * Creates the deletion folder before effective deletion.
     * @returns {*|any|Promise<void>} Promise of creation.
     */
    this.createDeletionFolder = () => this.deletionFolderPromise || (this.deletionFolderPromise = this.makeTree('.deleted'))
  }

  changeParent(newParent:CFSCore) {
    this.parent = newParent
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
      if (!this.parent) return null;
      return this.parent.read(filePath);
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
      let exists = await this.qfs.exists(path.join(this.rootPath, filePath));
      if (!exists && this.parent) {
        exists = this.parent.exists(filePath);
      }
      return exists;
    } catch (e) {
      if (!this.parent) return null;
      return this.parent.exists(filePath);
    }
  }

  /**
   * LIST operation of CFS. List files at given location. Tree traversal.
   * @param ofPath Location folder to list files.
   * @param localLevel Limit listing to local level.
   * @returns {*} Promise of file names.
   */
  async list(ofPath:string, localLevel = false): Promise<string[]> {
    const dirPath = path.normalize(ofPath);
    let files: string[] = [], folder = path.join(this.rootPath, dirPath);
    if (this.parent && !localLevel) {
      files = await this.parent.list(dirPath);
    }
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

  listLocal(ofPath:string) {
    return this.list(ofPath, LOCAL_LEVEL)
  }

  /**
   * WRITE operation of CFS. Writes the file in local Core.
   * @param filePath Path to the file to write.
   * @param content String content to write.
   * @param deep Wether to make a deep write or not.
   */
  async write(filePath:string, content:string, deep:boolean): Promise<void> {
    if (deep && this.parent) {
      return this.parent.write(filePath, content, deep);
    }
    return this.qfs.write(path.join(this.rootPath, filePath), content);
  };

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @param deep Wether to remove the file in the root core or not.
   * @returns {*} Promise of removal.
   */
  async remove(filePath:string, deep:boolean): Promise<void> {
    // Make a deep physical deletion
    if (deep && this.parent) {
      return this.parent.remove(filePath, deep);
    }
    // Not the root core, make a logical deletion instead of physical
    if (this.parent) {
      await this.createDeletionFolder();
      return this.qfs.write(path.join(this.rootPath, '.deleted', this.toRemoveFileName(filePath)), '');
    }
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
  listJSON(dirPath:string, localLevel:boolean) {
    return this.list(dirPath, localLevel).then(async (files) => Promise.all(files.map((f:string) => this.readJSON(path.join(dirPath, f)))))
  }

  /**
   * Read contents of files at given LOCAL path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   */
  listJSONLocal(dirPath:string) {
    return this.listJSON(dirPath, LOCAL_LEVEL)
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

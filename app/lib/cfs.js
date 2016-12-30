"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const path = require('path');

const LOCAL_LEVEL = true;
const DEEP_WRITE = true;

module.exports = function(rootPath, qfs, parent) {
  return new CFSCore(rootPath, qfs, parent);
};

function CFSCore(rootPath, qfs, parent) {

  const that = this;

  this.parent = parent;
  const deletedFolder = path.join(rootPath, '.deleted');
  let deletionFolderPromise;

  this.changeParent = (newParent) => this.parent = newParent;

  /**
   * Creates the deletion folder before effective deletion.
   * @returns {*|any|Q.Promise<void>} Promise of creation.
   */
  const createDeletionFolder = () => deletionFolderPromise || (deletionFolderPromise = that.makeTree('.deleted'));

  /**
   * READ operation of CFS. Reads given file. May lead to tree traversal if file is not found.
   * @param filePath Path to the file.
   * @returns {*} Promise for file content.
   */
  this.read = (filePath) => {
    return co(function *() {
      try {
        const isDeleted = yield qfs.exists(path.join(deletedFolder, toRemoveFileName(filePath)));
        if (isDeleted) {
          // A deleted file must be considered non-existant
          return null;
        }
        return yield qfs.read(path.join(rootPath, filePath));
      } catch (e) {
        if (!that.parent) return null;
        return that.parent.read(filePath);
      }
    });
  };

  /**
   * READ operation of CFS. Reads given file. May lead to tree traversal if file is not found.
   * @param filePath Path to the file.
   * @returns {*} Promise for file content.
   */
  this.exists = (filePath) => {
    return co(function *() {
      try {
        const isDeleted = yield qfs.exists(path.join(deletedFolder, toRemoveFileName(filePath)));
        if (isDeleted) {
          // A deleted file must be considered non-existant
          return false;
        }
        let exists = yield qfs.exists(path.join(rootPath, filePath));
        if (!exists && that.parent) {
          exists = that.parent.exists(filePath);
        }
        return exists;
      } catch (e) {
        if (!that.parent) return null;
        return that.parent.exists(filePath);
      }
    });
  };

  /**
   * LIST operation of CFS. List files at given location. Tree traversal.
   * @param ofPath Location folder to list files.
   * @param localLevel Limit listing to local level.
   * @returns {*} Promise of file names.
   */
  this.list = (ofPath, localLevel) => {
    const dirPath = path.normalize(ofPath);
    return co(function *() {
      let files = [], folder = path.join(rootPath, dirPath);
      if (that.parent && !localLevel) {
        files = yield that.parent.list(dirPath);
      }
      const hasDir = yield qfs.exists(folder);
      if (hasDir) {
        files = files.concat(yield qfs.list(folder));
      }
      const hasDeletedFiles = yield qfs.exists(deletedFolder);
      if (hasDeletedFiles) {
        const deletedFiles = yield qfs.list(deletedFolder);
        const deletedOfThisPath = deletedFiles.filter((f) => f.match(new RegExp('^' + toRemoveDirName(dirPath))));
        const locallyDeletedFiles = deletedOfThisPath.map((f) => f.replace(toRemoveDirName(dirPath), '')
                                                                    .replace(/^__/, ''));
        files = _.difference(files, locallyDeletedFiles);
      }
      return _.uniq(files);
    });
  };

  this.listLocal = (ofPath) => this.list(ofPath, LOCAL_LEVEL);

  /**
   * WRITE operation of CFS. Writes the file in local Core.
   * @param filePath Path to the file to write.
   * @param content String content to write.
   * @param deep Wether to make a deep write or not.
   */
  this.write = (filePath, content, deep) => {
    return co(function *() {
      if (deep && that.parent) {
        return that.parent.write(filePath, content, deep);
      }
      return qfs.write(path.join(rootPath, filePath), content);
    });
  };

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @param deep Wether to remove the file in the root core or not.
   * @returns {*} Promise of removal.
   */
  this.remove = (filePath, deep) => {
    return co(function *() {
      // Make a deep physical deletion
      if (deep && that.parent) {
        return that.parent.remove(filePath, deep);
      }
      // Not the root core, make a logical deletion instead of physical
      if (that.parent) {
        yield createDeletionFolder();
        return qfs.write(path.join(rootPath, '.deleted', toRemoveFileName(filePath)), '');
      }
      // Root core: physical deletion
      return qfs.remove(path.join(rootPath, filePath));
    });
  };

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @returns {*} Promise of removal.
   */
  this.removeDeep = (filePath) => this.remove(filePath, DEEP_WRITE);

  /**
   * Create a directory tree.
   * @param treePath Tree path to create.
   */
  this.makeTree = (treePath) => co(function*(){
    // Note: qfs.makeTree does not work on windows, so we implement it manually
    try {
      let normalized = path.normalize(treePath);
      let folders = normalized.split(path.sep);
      let folder = rootPath;
      for (let i = 0, len = folders.length; i < len; i++) {
        folder = folder ? path.join(folder, folders[i]) : folders[i];
        let exists = yield qfs.exists(folder);
        if (!exists) {
          yield qfs.makeDirectory(folder);
        }
      }
    } catch (e) {
      if (e && e.code !== "EISDIR" && e.code !== "EEXIST") throw e;
    }
  });

  /**
   * Write JSON object to given file.
   * @param filePath File path.
   * @param content JSON content to stringify and write.
   * @param deep Wether to make a deep write or not.
   */
  this.writeJSON = (filePath, content, deep) => this.write(filePath, JSON.stringify(content, null, ' '), deep);

  /**
   * Write JSON object to given file deeply in the core structure.
   * @param filePath File path.
   * @param content JSON content to stringify and write.
   */
  this.writeJSONDeep = (filePath, content) => this.writeJSON(filePath, content, DEEP_WRITE);

  /**
   * Read a file and parse its content as JSON.
   * @param filePath File to read.
   */
  this.readJSON = (filePath) => co(function*(){
    let data;
    try {
      data = yield that.read(filePath);
      return JSON.parse(data);
    } catch(err) {
      if (data && err.message.match(/^Unexpected token {/)) {
        // TODO: this is a bug thrown during Unit Tests with MEMORY_MODE true...
        return JSON.parse(data.match(/^(.*)}{.*/)[1] + '}');
      } else if (err.message.match(/^Unexpected end of input/)) {
        // Could not read, return empty object
        return {};
      }
      throw err;
    }
  });

  /**
   * Read contents of files at given path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   * @param localLevel Wether to read only local level or not.
   */
  this.listJSON = (dirPath, localLevel) => this.list(dirPath, localLevel).then((files) => {
    return co(function *() {
      return yield files.map((f) => that.readJSON(path.join(dirPath, f)));
    });
  });

  /**
   * Read contents of files at given LOCAL path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   */
  this.listJSONLocal = (dirPath) => this.listJSON(dirPath, LOCAL_LEVEL);

  /**
   * Normalize the path of a dir to be used for file deletion matching.
   * @param dirPath Directory path to normalize.
   * @returns {string|ng.ILocationService|XML} Normalized dir path.
   */
  function toRemoveDirName(dirPath) {
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
  function toRemoveFileName(filePath) {
    return path.normalize(filePath).replace(/\//g, '__').replace(/\\/g, '__');
  }
}

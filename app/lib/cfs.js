"use strict";

var Q = require('q');
var _ = require('underscore');
var co = require('co');
var path = require('path');

module.exports = function(rootPath, qfs, parent) {
  return new CFSCore(rootPath, qfs, parent);
};

function CFSCore(rootPath, qfs, parent) {

  var that = this;

  this.parent = parent;
  var deletedFolder = path.join(rootPath, '.deleted');
  var deletionFolderPromise;

  this.changeParent = (newParent) => this.parent = newParent;

  /**
   * Creates the deletion folder before effective deletion.
   * @returns {*|any|Q.Promise<void>} Promise of creation.
   */
  function createDeletionFolder() {
    return deletionFolderPromise || (deletionFolderPromise = qfs.makeTree(path.join(rootPath, '.deleted')));
  }

  /**
   * READ operation of CFS. Reads given file. May lead to tree traversal if file is not found.
   * @param filePath Path to the file.
   * @returns {*} Promise for file content.
   */
  this.read = (filePath) => {
    return co(function *() {
      try {
        return yield qfs.read(path.join(rootPath, filePath));
      } catch (e) {
        if (!that.parent) return null;
        return that.parent.read(filePath);
      }
    });
  };

  /**
   * LIST operation of CFS. List files at given location. Tree traversal.
   * @param ofPath Location folder to list files.
   * @returns {*} Promise of file names.
   */
  this.list = (ofPath) => {
    var dirPath = path.normalize(ofPath);
    return co(function *() {
      var files = [], folder = path.join(rootPath, dirPath);
      if (that.parent) {
        files = yield that.parent.list(dirPath);
      }
      var hasDir = yield qfs.exists(folder);
      if (hasDir) {
        files = files.concat(yield qfs.list(folder));
      }
      var hasDeletedFiles = yield qfs.exists(deletedFolder);
      if (hasDeletedFiles) {
        var deletedFiles = yield qfs.list(deletedFolder);
        var deletedOfThisPath = deletedFiles.filter((f) => f.match(new RegExp('^' + toRemoveDirName(dirPath))));
        var locallyDeletedFiles = deletedOfThisPath.map((f) => f.replace(toRemoveDirName(dirPath), '').replace(/^__/, ''));
        files = _.difference(files, locallyDeletedFiles);
      }
      return files;
    });
  };

  /**
   * WRITE operation of CFS. Writes the file in local Core.
   * @param filePath Path to the file to write.
   * @param content String content to write.
   */
  this.write = (filePath, content) => qfs.write(path.join(rootPath, filePath), content);

  /**
   * REMOVE operation of CFS. Set given file as removed. Logical deletion since physical won't work due to the algorithm of CFS.
   * @param filePath File to set as removed.
   * @returns {*} Promise of removal.
   */
  this.remove = (filePath) => {
    return co(function *() {
      if (that.parent) {
        yield createDeletionFolder();
        return yield qfs.write(path.join(rootPath, '.deleted', toRemoveFileName(filePath)), '');
      }
      return qfs.remove(path.join(rootPath, filePath));
    });
  };

  /**
   * Create a directory tree.
   * @param treePath Tree path to create.
   */
  this.makeTree = (treePath) => qfs.makeTree(path.join(rootPath, treePath));

  /**
   * Write JSON object to given file.
   * @param filePath File path.
   * @param content JSON content to stringify and write.
   */
  this.writeJSON = (filePath, content) => qfs.write(path.join(rootPath, filePath), JSON.stringify(content));

  /**
   * Read a file and parse its content as JSON.
   * @param filePath File to read.
   */
  this.readJSON = (filePath) => this.read(filePath).then(function(data) {
    return Q()
      .then(function(){
        return JSON.parse(data);
      })
      .catch(function(err){
        if (err.message.match(/^Unexpected token {/)) {
          // TODO: this is a bug thrown during Unit Tests with MEMORY_MODE true...
          return JSON.parse(data.match(/^(.*)}{.*/)[1] + '}');
        }
        throw err;
      });
  });

  /**
   * Read contents of files at given path and parse it as JSON.
   * @param dirPath Path to get the files' contents.
   */
  this.listJSON = (dirPath) => this.list(dirPath).then((files) => {
    return co(function *() {
      return yield files.map((f) => that.readJSON(path.join(dirPath, f)));
    });
  });

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

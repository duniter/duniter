/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');
var sha1 = require('sha1');

module.exports = LinksDAL;

function LinksDAL(rootPath, qioFS, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  // CFS facilities
  AbstractStorage.call(this, rootPath, qioFS, parentCore, localDAL);

  var validCacheFrom = {}, validCacheTo = {};

  this.cachedLists = {
  };

  this.init = () => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('links/'),
        that.coreFS.makeTree('links/valid/'),
        that.coreFS.makeTree('links/valid/from'),
        that.coreFS.makeTree('links/valid/to'),
        that.coreFS.makeTree('links/obsolete/')
      ];
      // TODO: not really proud of that, has to be refactored for more generic code
      if (that.dal.name == 'fileDal') {
        // Load in cache
        var files = yield that.coreFS.list('links/valid/from/');
        yield files.map((pubkey) => {
          return co(function *() {
            var links = yield that.coreFS.listJSON('links/valid/from/' + pubkey + '/');
            for (var i = 0; i < links.length; i++) {
              var link = links[i];
              validCacheFrom[link.source] = validCacheFrom[link.source] || {};
              validCacheFrom[link.source][getLinkID(link)] = link;
              validCacheTo[link.target] = validCacheTo[link.target] || {};
              validCacheTo[link.target][getLinkID(link)] = link;
            }
          });
        });
      }
    });
  };

  this.getValidLinksFrom = (pubkey) => {
    return co(function *() {
      // TODO: refactor for more generic code
      if (that.dal.name == 'fileDal') {
        return _.values(validCacheFrom[pubkey]);
      }
      return that.coreFS.listJSON('links/valid/from/' + pubkey + '/');
    });
  };

  this.getValidLinksTo = (pubkey) => {
    return co(function *() {
      // TODO: refactor for more generic code
      if (that.dal.name == 'fileDal') {
        return _.values(validCacheTo[pubkey] || []);
      }
      return that.coreFS.listJSON('links/valid/to/' + pubkey + '/');
    });
  };

  this.getObsoletes = () => that.coreFS.list('links/obsolete/');

  this.obsoletesLinks = function(minTimestamp) {
    return co(function *() {
      var files = yield that.coreFS.list('links/valid/from/');
      for (var i = 0; i < files.length; i++) {
        var pubkey = files[i];
        var files2 = yield that.coreFS.list('links/valid/from/' + pubkey + '/');
        for (var j = 0; j < files2.length; j++) {
          var file2 = files2[j];
          var ts = file2.split('-')[1].replace(/\.json/, '');
          if (parseInt(ts, 10) <= minTimestamp) {
            var link = yield that.coreFS.readJSON('links/valid/from/' + pubkey + '/' + file2);
            yield [
              that.coreFS.remove('links/valid/from/' + link.source + '/' + getLinkIDTo(link) + '.json').catch(() => null),
              that.coreFS.remove('links/valid/to/' + link.target + '/' + getLinkIDFrom(link) + '.json').catch(() => null)
            ];
            yield that.coreFS.writeJSON('links/obsolete/' + getLinkID(link) + '.json', link);
            if (validCacheFrom[link.source]) {
              delete validCacheFrom[link.source][link.target];
            }
            if (validCacheTo[link.target]) {
              delete validCacheTo[link.target][getLinkID(link)];
            }
          }
        }
      }
    });
  };

  this.addLink = (link) => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('links/valid/from/' + link.source + '/'),
        that.coreFS.makeTree('links/valid/to/' + link.target + '/')
      ];
      yield [
        that.coreFS.writeJSON('links/valid/from/' + link.source + '/' + getLinkIDTo(link) + '.json', link),
        that.coreFS.writeJSON('links/valid/to/' + link.target + '/' + getLinkIDFrom(link) + '.json', link)
      ];
      // TODO: refactor for more generic code
      if (that.dal.name == 'fileDal') {
        validCacheFrom[link.source] = validCacheFrom[link.source] || {};
        validCacheFrom[link.source][getLinkID(link)] = link;
        validCacheTo[link.target] = validCacheTo[link.target] || {};
        validCacheTo[link.target][getLinkID(link)] = link;
      }
    });
  };

  function getLinkIDTo(link) {
    return [link.target, link.timestamp].join('-');
  }

  function getLinkIDFrom(link) {
    return [link.source, link.timestamp].join('-');
  }

  function getLinkID(link) {
    return [link.source, link.target, link.timestamp].join('-');
  }
}
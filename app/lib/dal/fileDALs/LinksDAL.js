/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = LinksDAL;

function LinksDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;
  var validCacheFrom = {}, validCacheTo = {};

  this.cachedLists = {
    'linksFrom': ['getValidLinksFrom'],
    'linksTo': ['getValidLinksTo']
  };

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('links/'),
        that.makeTree('links/valid/'),
        that.makeTree('links/valid/from'),
        that.makeTree('links/valid/to'),
        that.makeTree('links/obsolete/')
      ])
        .then(function(){
          // TODO: not really proud of that, has to be refactored for more generic code
          if (that.dal.name == 'fileDal') {
            // Load in cache
            return that.list('links/valid/from/')
              .then(function (files) {
                return Q.all(files.map(function (file) {
                  var pubkey = file.file;
                  return that.list('links/valid/from/' + pubkey + '/')
                    .then(function (files2) {
                      return Q.all(files2.map(function (file2) {
                        return that.read('links/valid/from/' + pubkey + '/' + file2.file)
                          .then(function (link) {
                            validCacheFrom[link.source] = validCacheFrom[link.source] || {};
                            validCacheFrom[link.source][link.target] = link;
                            validCacheTo[link.target] = validCacheTo[link.target] || {};
                            validCacheTo[link.target][link.source] = link;
                          });
                      }));
                    });
                }));
              });
          }
        });
    }
    return treeMade;
  };

  this.getValidLinksFrom = function(pubkey) {
    // TODO: refactor for more generic code
    if (that.dal.name == 'fileDal') {
      return that.initTree()
        .then(function() {
          return _.values(validCacheFrom[pubkey]);
        });
    }
    var links = [];
    return that.initTree()
      .then(function(){
        return that.list('links/valid/from/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('links/valid/from/' + pubkey + '/', links))
      .thenResolve(links);
  };

  this.getValidLinksTo = function(pubkey) {
    // TODO: refactor for more generic code
    if (that.dal.name == 'fileDal') {
      return that.initTree()
        .then(function() {
          return _.values(validCacheTo[pubkey]);
        });
    }
    var links = [];
    return that.initTree()
      .then(function(){
        return that.list('links/valid/to/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('links/valid/to/' + pubkey + '/', links))
      .thenResolve(links);
  };

  this.getObsoleteLinksFrom = function(pubkey) {
    var links = [];
    return that.initTree()
      .then(function(){
        return that.list('links/obsolete/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('links/obsolete/' + pubkey + '/', links))
      .thenResolve(links);
  };

  this.obsoletesLinks = function(minTimestamp) {
    return that.initTree()
      .then(function(){
        return that.list('links/valid/from/')
          .then(function (files) {
            return Q.all(files.map(function (file) {
              var pubkey = file.file;
              return that.list('links/valid/from/' + pubkey + '/')
                .then(function (files2) {
                  return Q.all(files2.map(function (file2) {
                    var ts = file2.file.split('-')[1].replace(/\.json/, '');
                    if (parseInt(ts, 10) <= minTimestamp) {
                      return that.read('links/valid/from/' + pubkey + '/' + file2.file)
                        .then(function (link) {
                          return Q.all([
                            that.remove('links/valid/from/' + link.source + '/' + getLinkIDTo(link) + '.json'),
                            that.remove('links/valid/to/' + link.target + '/' + getLinkIDFrom(link) + '.json')
                          ])
                            .then(function () {
                              return that.write('links/obsolete/' + getLinkID(link) + '.json', link)
                                .tap(function () {
                                  delete validCacheFrom[link.source][link.target];
                                  delete validCacheTo[link.target][link.source];
                                });
                            });
                        });
                    }
                  }));
                });
            }));
          });
      });
  };

  this.addLink = function(link) {
    return that.initTree()
      .then(function(){
        return Q.all([
          that.makeTree('links/valid/from/' + link.source + '/'),
          that.makeTree('links/valid/to/' + link.target + '/')
        ]);
      })
      .then(function(){
        return Q.all([
          that.write('links/valid/from/' + link.source + '/' + getLinkIDTo(link) + '.json', link),
          that.write('links/valid/to/' + link.target + '/' + getLinkIDFrom(link) + '.json', link)
        ]);
      })
      .tap(function() {
        // TODO: refactor for more generic code
        if (that.dal.name == 'fileDal') {
          validCacheFrom[link.source] = validCacheFrom[link.source] || {};
          validCacheFrom[link.source][link.target] = link;
          validCacheTo[link.target] = validCacheTo[link.target] || {};
          validCacheTo[link.target][link.source] = link;
        }
        else {
          that.invalidateCache('linksFrom', link.source);
          that.invalidateCache('linksTo', link.target);
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
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

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('links/'),
        that.makeTree('links/valid/'),
        that.makeTree('links/valid/from'),
        that.makeTree('links/valid/to'),
        that.makeTree('links/obsolete/')
      ]);
    }
    return treeMade;
  };

  this.getValidLinksFrom = function(pubkey) {
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
        return that.list('sources/available/from/')
          .then(function(files){
            return Q.all(files.map(function(file) {
              var pubkey = file.file;
              return that.list('sources/available/from/' + pubkey + '/')
                .then(function (files2) {
                  var ts = files2.file.split('-')[1];
                  if (parseInt(ts, 10) <= minTimestamp) {
                    return that.read('sources/available/from/' + pubkey)
                      .then(function (link) {
                        return that.remove('sources/available/from/' + pubkey + '/' + files2.file)
                          .then(function () {
                            return that.write('sources/obsolete/' + getLinkID(link) + '.json', link);
                          });
                      });
                  }
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
"use strict";

var assert = require('assert');
var co = require('co');
var Q = require('q');
var leveldb = require('./../../app/lib/leveldb');
var levelup = require('levelup');
var leveldown = require('memdown');
let db = levelup({
  db: leveldown
});

function put(key, value) {
  return Q.nbind(db.put, db)(key, value);
}

describe("LevelDB", () => {

  before(function() {
    return co(function *() {
      yield put('/B3', JSON.stringify({ "files": ['A.json', 'C.json'] }));
      yield put('/B4', JSON.stringify({ "files": ['B.json'] }));
      yield put('/B5_a', JSON.stringify({ "files": ['A.json'] }));
      yield put('/OTHER', JSON.stringify({ "files": ['X.json'] }));
      yield put('/B3/A.json', JSON.stringify({ "text": "Content of A from B3" }));
      yield put('/B3/C.json', JSON.stringify({ "text": "Content of C from B3" }));
      yield put('/B4/B.json', JSON.stringify({ "text": "Content of B" }));
      yield put('/B5_a/A.json', JSON.stringify({ "text": "Content of A from B5_a" }));
      yield put('/OTHER/X.json', JSON.stringify({ "text": "Content of X" }));
    });
  });

  var coreB3 = leveldb('/B3', db);
  var coreB4 = leveldb('/B4', db, coreB3);
  var coreB5 = leveldb('/B5_a', db, coreB4);

  var rootCore = leveldb('/OTHER', db);

  // ------------ Direct READ ------------

  it('should have the content of A.json from B5', () => {
    return co(function *() {
      var content = yield coreB5.readJSON('A.json');
      content.should.have.property('text').equal('Content of A from B5_a');
    });
  });

  // ------------ Traversal READ ------------

  it('should have the content of B.json from B5 (traversal read to B4)', () => {
    return co(function *() {
      var content = yield coreB5.readJSON('B.json');
      content.should.have.property('text').equal('Content of B');
    });
  });

  it('should have the content of C.json from B5 (traversal read to B3)', () => {
    return co(function *() {
      var content = yield coreB5.readJSON('C.json');
      content.should.have.property('text').equal('Content of C from B3');
    });
  });

  // WRITE of file /C.json

  it('should have the content of C.json modified from B5 (direct read)', () => {
    return co(function *() {
      yield coreB5.writeJSON('C.json', { text: 'Content of C from B5_a'});
      var content = yield coreB5.readJSON('C.json');
      content.should.have.property('text').equal('Content of C from B5_a');
    });
  });

  // WRITE of file /D.json

  it('should have the content of C.json modified from B5 (direct read)', () => {
    return co(function *() {
      yield coreB4.writeJSON('D.json', { text: 'Content of D'});
      var content = yield coreB5.readJSON('D.json');
      content.should.have.property('text').equal('Content of D');
    });
  });

  // REMOVE file /D.json

  it('should have the content of C.json modified from B5 (direct read)', () => {
    return co(function *() {
      yield coreB4.remove('D.json');
      var exists = yield coreB5.exists('D.json');
      var content = yield coreB5.read('D.json');
      assert.equal(exists, false);
      assert.equal(content, null);
    });
  });

  // ------------ LIST ------------

  it('should have G,H,I as files from /DIR', () => {
    return co(function *() {
      yield coreB3.makeTree('/DIR');
      yield coreB4.makeTree('/DIR');
      yield coreB5.makeTree('/DIR');
      yield coreB3.writeJSON('/DIR/G.json', { text: 'Content of DIR/I'});
      yield coreB4.writeJSON('/DIR/H.json', { text: 'Content of DIR/H'});
      yield coreB5.writeJSON('/DIR/I.json', { text: 'Content of DIR/G'});
      var files = yield coreB5.list('/DIR');
      files.should.have.length(3);
      files.should.deepEqual(['G.json', 'H.json', 'I.json']);
    });
  });

  // WRITE of file /DIR2/I.json in B3

  it('should have I as files from /DIR2', () => {
    return co(function *() {
      yield coreB3.makeTree('/DIR2');
      yield coreB3.writeJSON('/DIR2/I.json', { text: 'Content of DIR2/I in B3'});
      // Check the list
      var files = yield coreB5.list('/DIR2');
      files.should.have.length(1);
      files.should.deepEqual(['I.json']);
      // Check its contents
      var contents = yield coreB5.listJSON('/DIR2');
      contents.should.have.length(1);
      contents.should.deepEqual([{ text: 'Content of DIR2/I in B3' }]);
    });
  });

  // WRITE of file /DIR2/I.json in B4

  it('should have I as files from /DIR2', () => {
    return co(function *() {
      yield coreB3.makeTree('/DIR2');
      yield coreB3.writeJSON('/DIR2/I.json', { text: 'Content of DIR2/I in B4'});
      var files = yield coreB5.list('/DIR2');
      files.should.have.length(1);
      files.should.deepEqual(['I.json']);
      // Check its contents
      var contents = yield coreB5.listJSON('/DIR2');
      contents.should.have.length(1);
      contents.should.deepEqual([{ text: 'Content of DIR2/I in B4' }]);
    });
  });

  // REMOVE of file /DIR2/I.json in B5

  it('should have no files from /DIR2 after file DELETION', () => {
    return co(function *() {
      yield coreB5.remove('/DIR2/I.json');
      var files = yield coreB5.list('/DIR2');
      files.should.have.length(0);
      // Check its contents
      var contents = yield coreB5.listJSON('/DIR2');
      contents.should.have.length(0);
    });
  });

  describe("Root core", () => {

    it('should have 1 file in /OTHER folder', () => {
      return co(function *() {
        var files = yield rootCore.list('/');
        files.should.have.length(1);
        // Check its contents
        var contents = yield rootCore.listJSON('/');
        contents.should.have.length(1);
        contents.should.deepEqual([{ text: 'Content of X' }]);
      });
    });

    // REMOVE of file /OTHER/X.json in rootCore

    it('should have no files from /OTHER after file DELETION', () => {
      return co(function *() {
        yield rootCore.remove('/X.json');
        var files = yield rootCore.list('/');
        files.should.have.length(0);
        // Check its contents
        var contents = yield rootCore.listJSON('/');
        contents.should.have.length(0);
      });
    });
  });
});

"use strict";

var co = require('co');
var cfs = require('./../../app/lib/cfs');
var mockFS = require('q-io/fs-mock')({
  'B5_a': {
    "A.json": '{ "text": "Content of A from B5_a" }'
  },
  'B4': {
    'B.json': '{ "text": "Content of B" }'
  },
  'B3': {
    'A.json': '{ "text": "Content of A from B3" }',
    'C.json': '{ "text": "Content of C from B3" }'
  }
});

describe("CFS", () => {

  var coreB3 = cfs('/B3', mockFS);
  var coreB4 = cfs('/B4', mockFS, coreB3);
  var coreB5 = cfs('/B5_a', mockFS, coreB4);

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
});

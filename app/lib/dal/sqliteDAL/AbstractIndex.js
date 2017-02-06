/**
 * Created by cgeek on 22/08/15.
 */

const _ = require('underscore');
const co = require('co');
const indexer = require('../../dup/indexer');

module.exports = AbstractIndex;

function AbstractIndex() {

  "use strict";

  const that = this;

  this.getWrittenOn = (blockstamp) => that.query('SELECT * FROM ' + that.table + ' WHERE written_on = ?', [blockstamp]);

  this.trimRecords = (belowNumber) => co(function*() {
    const belowRecords = yield that.query('SELECT COUNT(*) as nbRecords, pub FROM ' + that.table + ' ' +
      'WHERE CAST(written_on as int) < ? ' +
      'GROUP BY pub ' +
      'HAVING nbRecords > 1', [belowNumber]);
    const reducedByPub = indexer.DUP_HELPERS.reduceBy(belowRecords, ['pub']);
    for (const rec of reducedByPub) {
      const recordsOfPub = yield that.query('SELECT * FROM ' + that.table + ' WHERE pub = ?', [rec.pub]);
      const toReduce = _.filter(recordsOfPub, (rec) => parseInt(rec.written_on) < belowNumber);
      if (toReduce.length) {
        // Clean the records in the DB
        yield that.exec('DELETE FROM ' + that.table + ' WHERE pub = \'' + rec.pub + '\'');
        const nonReduced = _.filter(recordsOfPub, (rec) => parseInt(rec.written_on) >= belowNumber);
        const reduced = indexer.DUP_HELPERS.reduce(toReduce);
        // Persist
        yield that.insertBatch([reduced].concat(nonReduced));
      }
    }
  });
}

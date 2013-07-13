/**

  This file is for development purposes only.

*/

var config      = require('../config'),
    http        = require('http'),
    nodecoin    = require('../lib/nodecoin');

// Init Express app
var app = nodecoin.express.app(config);

http.createServer(app).listen(app.get('port'), function(){
  console.log('NodeCoin server listening on port ' + app.get('port'));
});

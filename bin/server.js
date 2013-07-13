/**

  This file is for development purposes only.

*/

var config      = require('../config'),
    http        = require('http'),
    nodecoin    = require('../lib/nodecoin');

// Bootstraps models
nodecoin.database.init();
nodecoin.database.connect(config, function (err) {
  if(!err)
    console.log("Connected to MongoDB.");
  else
    console.log("Error connecting to DB: " + err);
});

// Init Express app
var app = nodecoin.express.app(config);

http.createServer(app).listen(app.get('port'), function(){
  console.log('NodeCoin server listening on port ' + app.get('port'));
});

"use strict"

const co = require('co')

module.exports = {
  duniter: {
    cli: [{
      name: 'hello-world',
      desc: 'Says hello from \`duniter\` command.',
      logs: false,
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const msg = 'Hello world! from within Duniter.'
        console.log(msg)
        return msg
      })
    }]
  }
}

"use strict";

const co = require('co');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;

module.exports = {
  duniter: {

    methods: {
      canWrite: getNPMAccess,
      npmInstall,
      npmRemove
    },

    cli: [{
      name: 'plug [what]',
      desc: 'Plugs in a duniter module to this Duniter codebase, making it available for the node.',
      logs: false,
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const what = params[0];
        try {
          console.log('Trying to install module "%s"...', what)
          yield checkNPMAccess()
          yield npmInstall(what)
          console.log('Module successfully installed.')
        } catch (err) {
          console.error('Error during installation of the plugin:', err);
        }
        // Close the DB connection properly
        return server && server.disconnect()
      })
    }, {
      name: 'unplug [what]',
      desc: 'Plugs in a duniter module to this Duniter codebase, making it available for the node.',
      logs: false,
      onDatabaseExecute: (server, conf, program, params) => co(function*() {
        const what = params[0];
        try {
          console.log('Trying to remove module "%s"...', what)
          yield checkNPMAccess()
          yield npmRemove(what)
          console.log('Module successfully uninstalled.')
        } catch (err) {
          console.error('Error during installation of the plugin:', err);
        }
        // Close the DB connection properly
        return server && server.disconnect()
      })
    }]
  }
}

function npmInstall(what, npm, cwd) {
  return new Promise((res, rej) => {
    const node = getNode()
    npm = npm || getNPM()
    cwd = cwd || getCWD()
    const install = spawn(node, [npm, 'i', '--save', what], { cwd })

    install.stdout.pipe(process.stdout)
    install.stderr.pipe(process.stderr)

    install.stderr.on('data', (data) => {
      if (data.toString().match(/ERR!/)) {
        setTimeout(() => {
          install.kill('SIGINT')
        }, 100)
      }
    });

    install.on('close', (code) => {
      if (code === null || code > 0) {
        return rej('could not retrieve or install the plugin')
      }
      res()
    });
  })
}


function npmRemove(what, npm, cwd) {
  return new Promise((res, rej) => {
    const node = getNode()
    npm = npm || getNPM()
    cwd = cwd || getCWD()
    const uninstall = spawn(node, [npm, 'remove', '--save', what], { cwd })

    uninstall.stdout.pipe(process.stdout)
    uninstall.stderr.pipe(process.stderr)

    uninstall.stderr.on('data', (data) => {
      if (data.toString().match(/ERR!/)) {
        setTimeout(() => {
          uninstall.kill('SIGINT')
        }, 100)
      }
    });

    uninstall.on('close', (code) => {
      if (code === null || code > 0) {
        return rej('error during the uninstallation of the plugin')
      }
      res()
    });
  })
}

function getNode() {
  return process.argv[0].replace(/(node|nw)$/, 'node')
}

function getNPM() {
  return process.argv[0].replace(/(node|nw)$/, 'npm')
}

function getCWD() {
  return process.argv[1].replace(/bin\/duniter$/, '')
}

function checkNPMAccess() {
  return co(function*() {
    const hasReadWriteAccess = yield getNPMAccess()
    if (!hasReadWriteAccess) {
      throw 'no write access on disk'
    }
  })
}

function getNPMAccess() {
  return co(function*() {
    const hasAccessToPackageJSON = yield new Promise((res) => {
      fs.access(path.join(__dirname, '/../../package.json'), fs.constants.R_OK | fs.constants.W_OK, (err) => {
        res(!err)
      })
    })
    const hasAccessToNodeModules = yield new Promise((res) => {
      fs.access(path.join(__dirname, '/../../node_modules'), fs.constants.R_OK | fs.constants.W_OK, (err) => {
        res(!err)
      })
    })
    console.log(hasAccessToPackageJSON, hasAccessToNodeModules)
    return hasAccessToPackageJSON && hasAccessToNodeModules
  })
}

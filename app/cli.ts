const Command = require('commander').Command;
const pjson = require('../package.json');
const duniter = require('../index');

export const ExecuteCommand = () => {

  const options:any = [];
  const commands:any = [];

  return {

    addOption: (optFormat:string, optDesc:string, optParser:any) => options.push({ optFormat, optDesc, optParser }),

    addCommand: (command:any, executionCallback:any) => commands.push({ command, executionCallback }),

    // To execute the provided command
    execute: async (programArgs:string[]) => {

      const program = new Command();

      // Callback for command success
      let onResolve:any;

      // Callback for command rejection
      let onReject:any = () => Promise.reject(Error("Uninitilized rejection throw"));

      // Command execution promise
      const currentCommand = new Promise((resolve, reject) => {
        onResolve = resolve;
        onReject = reject;
      });

      program
        .version(pjson.version)
        .usage('<command> [options]')

        .option('--home <path>', 'Path to Duniter HOME (defaults to "$HOME/.config/duniter").')
        .option('-d, --mdb <name>', 'Database name (defaults to "duniter_default").')

        .option('--autoconf', 'With `config` and `init` commands, will guess the best network and key options witout asking for confirmation')
        .option('--addep <endpoint>', 'With `config` command, add given endpoint to the list of endpoints of this node')
        .option('--remep <endpoint>', 'With `config` command, remove given endpoint to the list of endpoints of this node')

        .option('--no-eco-mode', 'Do not reduce CPU usage for proof-of-work computation')
        .option('--cpu <percent>', 'Percent of CPU usage for proof-of-work computation', parsePercent)
        .option('--nb-cores <number>', 'Number of cores uses for proof-of-work computation', parseInt)
        .option('--prefix <nodeId>', 'Prefix node id for the first character of nonce', parseInt)

        .option('-c, --currency <name>', 'Name of the currency managed by this node.')

        .option('--nostdout', 'Disable stdout printing for `export-bc` command')
        .option('--noshuffle', 'Disable peers shuffling for `sync` command')

        .option('--socks-proxy <host:port>', 'Use Socks Proxy')
        .option('--tor-proxy <host:port>', 'Use Tor Socks Proxy')
        .option('--reaching-clear-ep <clear|tor|none>', 'method for reaching an clear endpoint')
        .option('--force-tor', 'force duniter to contact endpoint tor (if you redirect the traffic to tor yourself)')
        .option('--rm-proxies', 'Remove all proxies')

        .option('--timeout <milliseconds>', 'Timeout to use when contacting peers', parseInt)
        .option('--httplogs', 'Enable HTTP logs')
        .option('--nohttplogs', 'Disable HTTP logs')
        .option('--isolate', 'Avoid the node to send peering or status informations to the network')
        .option('--forksize <size>', 'Maximum size of fork window', parseInt)
        .option('--memory', 'Memory mode')
      ;

      for (const opt of options) {
        program
          .option(opt.optFormat, opt.optDesc, opt.optParser);
      }

      for (const cmd of commands) {
        program
          .command(cmd.command.name)
          .description(cmd.command.desc)
          .action(async function() {
            const args = Array.from(arguments);
            try {
              const resOfExecution = await cmd.executionCallback.apply(null, [program].concat(args));
              onResolve(resOfExecution);
            } catch (e) {
              onReject(e);
            }
          });
      }

      program
        .on('*', function (cmd:any) {
          console.log("Unknown command '%s'. Try --help for a listing of commands & options.", cmd);
          onResolve();
        });

      program.parse(programArgs);

      if (programArgs.length <= 2) {
        onReject('No command given.');
      }
      return currentCommand;
    }
  };
};

function parsePercent(s:string) {
  const f = parseFloat(s);
  return isNaN(f) ? 0 : f;
}

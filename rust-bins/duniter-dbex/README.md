# Duniter databases explorer (dex)

## Compile

    git clone https://git.duniter.org/nodes/typescript/duniter.git
    cd duniter
    cargo build --release -p duniter-dbex

The binary executable is then here:  `target/release/dex`

## Use

See `dex --help`

## Autocompletion

Bash autocompletion script is available here : `target/release/dex.bash`

**Several others Shell are supported : Zsh, Fish, Powershell and Elvish!**

To generate the autocompletion script for your shell, recompile with env var `COMPLETION_SHELL`.

For example for fish : `COMPLETION_SHELL=fish cargo build --release -p duniter-dbex`

The autocompletion script can be found in : `target/release/`

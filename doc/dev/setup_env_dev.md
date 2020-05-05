
# Setting up your development environment

Title: Setting up your development environment
Order: 1
Date: 2020-05-04
Slug: setup_env_dev
Authors: elois

## Prerequisites

To develop on Duniter, there is currently the following requirement:

- A computer with GNU/Linux or Mac as operating system
- Build essential tools
- git (apt-get install git)
- Nvm
- Rust
- Yarn

And preferably an IDE that supports [Typescript] and [Rust] well.

[Rust]: https://www.rust-lang.org/
[Typescript]: https://www.typescriptlang.org/

### Install Prerequisites

Nvm:

    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

Rust:

    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -- -y

Yarn: [installation instructions][yarn]

## Build the project

### Clone de repository

    git clone https://git.duniter.org/nodes/typescript/duniter

### Install and use the correct version of nodejs

Check the required node version in the `package.json` file on line 5.

If, for example, version 10 is expected, install and select it with the following command:

    nvm install 10 && nvm use 10

### Build the project and play automated tests

**WARNING**: the 1st compilation of the project requires a lot of resources on your machine, and several long minutes, don't do anything else at the same time!

Command to compile :

    yarn

**WARNING**: playing automated tests takes a lot of resources on your machine and those for several minutes, don't do anything else at the same time!

Command to play automated tests:

    yarn test

If all the tests are successful, the command ends like this:

    ```bash
      777 passing (40s)
      19 pending

    Done in 43.80s.
    ```

## Configure your IDE

Personally, I use VsCodium/VsCode, so I give the configuration for this IDE.

### Configure VsCodium/VsCode

VsCodium/VsCode natively contains everything you need for Typescript.  
For the Rust part, I strongly recommend the following plugins:

- Better TOML (identifier: `bungcip.better-toml`)
- CodeLLDB (identifier: `vadimcn.vscode-lldb`)
- rust-analyzer (identifier: `matklad.rust-analyzer`)

The recommended ide configuration can be found in `doc/dev/vscode/settings.json`.

#### Debugger configuration

The recommended debugger configuration can be found in `doc/dev/.vscode/launch.json`.  
For import it:

    cp doc/dev/vscode/launch.json .vscode/launch.json

You can then adapt it according to your preferences for use :)

[Rust]: https://www.rust-lang.org/
[Typescript]: https://www.typescriptlang.org/
[yarn]: https://classic.yarnpkg.com/en/docs/install/

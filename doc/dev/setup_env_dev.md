
# Setting up your development environment

Title: Setting up your development environment
Order: 1
Date: 2020-05-04
Slug: setup_env_dev
Authors: elois

## In a post-it

```bash
git clone git@git.duniter.org:nodes/typescript/duniter.git
cd duniter
cargo xtask build
./target/release/duniter start
```

## Step by step

### Prerequisites

To develop on Duniter, there is currently the following requirement:

- A computer with GNU/Linux or Mac as operating system
- Build essential tools: Amongs other: GCC C++
- wget
- git (apt-get install git)
- Rust

And preferably an IDE that supports [Typescript] and [Rust] well.

#### Install Prerequisites

##### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

Them add `~/.cargo/bin` on your PATH.

If you use `bash`:

```bash
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> .bashrc
```

### Build the project

#### Clone the repository

```bash
git clone https://git.duniter.org/nodes/typescript/duniter
```

#### Build the project and play automated tests

**WARNING**: the 1st compilation of the project requires a lot of resources on your machine, and several long minutes, don't do anything else at the same time!

Command to compile :

```bash
cargo xtask build
```

The binary to run duniter-server is then found here: `target/release/duniter`

**WARNING**: playing automated tests takes a lot of resources on your machine and those for several minutes, don't do anything else at the same time!

Command to play automated tests:

```bash
cargo xtask test
```

If all the tests are successful, the command ends like this:

```bash
  777 passing (40s)
  19 pending
Done in 43.80s.
```

### Configure your IDE

Personally, I use VsCodium/VsCode, so I give the configuration for this IDE.

#### Configure VsCodium/VsCode

VsCodium/VsCode natively contains everything you need for Typescript.  
For the Rust part, I strongly recommend the following plugins:

- Better TOML (identifier: `bungcip.better-toml`)
- CodeLLDB (identifier: `vadimcn.vscode-lldb`)
- rust-analyzer (identifier: `matklad.rust-analyzer`)

The recommended IDE configuration can be found in `doc/dev/vscode/settings.json`.

##### Debugger configuration

The recommended debugger configuration can be found in `doc/dev/.vscode/launch.json`.  
For import it:

```bash
cp doc/dev/vscode/launch.json .vscode/launch.json
```

You can then adapt it according to your preferences for use :)

[Rust]: https://www.rust-lang.org/
[Typescript]: https://www.typescriptlang.org/

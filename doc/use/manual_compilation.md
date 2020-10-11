
# Compile Duniter manually from source code

Title: Compile Duniter manually
Order: 1
Date: 2020-05-05
Slug: manual_compilation
Authors: elois

## Prerequisites

To compile Duniter manually, there is currently the following requirement:

- A computer with GNU/Linux or Mac as operating system
- Build essential tools
- cmake
- Rust
- tar or unzip or git (to download and extract source code)
- wget

### Get source code

#### From archive tar.gz or zip

Url to download source code of a specific Duniter version X.Y.Z:

- tar.gz: https://git.duniter.org/nodes/typescript/duniter/repository/vX.Y.Z/archive.tar.gz
- zip: https://git.duniter.org/nodes/typescript/duniter/repository/vX.Y.Z/archive.zip

*Replace X.Y.Z with the version of Duniter you want to install.*

Then extract the archive to the folder of your choice.

#### With git

Latest stable version:

    git clone https://git.duniter.org/nodes/typescript/duniter -b stable --depth 1

Specific version:

    git clone https://git.duniter.org/nodes/typescript/duniter -b X.Y.Z --depth 1

*Replace X.Y.Z with the version of Duniter you want to install.*

### Install Prerequisites

#### Build essential tools

Build essential tools:

Depend on your distribution:

##### Debian/Ubuntu

    apt-get install build-essential cmake

##### Fedora

    yum groupinstall "Development Tools" "Development Libraries"

TODO: If you know how to install build essential tools for other gnu/linux distributions or for mac, you can complete this documentation and submit a merge request.

#### Rust

    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

## Build the project

Go to the root of the folder where you extracted the source code (or possibly cloned from git).

**WARNING**: the compilation of the project requires a lot of resources on your machine, and several long minutes, don't do anything else at the same time!

Command to compile :

    cargo xtask build --production

### Set autocompletion

To install or update Duniter's command auto-completion:

    bin/duniter completions bash > /etc/bash_completion.d/duniter_completion.bash

### Run on command line

    bin/duniter start

### Run on gui

    bin/duniter webstart

then open `localhost:9220` on your browser.

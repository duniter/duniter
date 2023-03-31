//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use anyhow::Result;
use std::process::{Command, Output};
use structopt::StructOpt;
use version_compare::Version;

const MIN_RUST_VERSION: &str = "1.51.0";
const MIN_NODE_VERSION: &str = "10.18.0";
const REC_NODE_VERSION: &str = "10.22.1";
const MAX_NODE_VERSION: &str = "11.0.0";

#[derive(StructOpt)]
struct DuniterXTask {
    #[structopt(long)]
    skip_npm: bool,
    #[structopt(subcommand)]
    command: DuniterXTaskCommand,
}

#[derive(StructOpt)]
enum DuniterXTaskCommand {
    Build {
        #[structopt(long)]
        production: bool,
    },
    Test,
}

fn main() -> Result<()> {
    let args = DuniterXTask::from_args();

    if !version_check::is_min_version(MIN_RUST_VERSION).unwrap_or(false)
        && exec_should_success(Command::new("rustup").args(["update", "stable"])).is_err()
    {
        eprintln!(
                "Duniter requires Rust {} or higher. If you installed the Rust toolchain via rustup, please execute the command `rustup update stable`.",
                MIN_RUST_VERSION
            );
        std::process::exit(1);
    }
    Command::new("rustc").arg("--version").status()?;
    Command::new("cargo").arg("--version").status()?;

    if !args.skip_npm {
        println!("Check node version …");
        let node_vers = exec_and_get_stdout(Command::new("node").arg("-v")).unwrap_or_default();
        let node_vers = node_vers.trim_end();
        let node_vers_cut = Version::from(&node_vers[1..]).unwrap();
        let min_node_vers = Version::from(MIN_NODE_VERSION).unwrap();
        let max_node_vers = Version::from(MAX_NODE_VERSION).unwrap();
        if node_vers_cut < min_node_vers || max_node_vers <= node_vers_cut {
            eprintln!(
                "Duniter requires node between v{} and v{} excluded.\n\
                Please install a correct node version (you can use nvm).\n\
                Current version {}. Recommended version v{}",
                MIN_NODE_VERSION, MAX_NODE_VERSION, node_vers, REC_NODE_VERSION
            );
            std::process::exit(1);
        } else {
            println!("Node {} installed: Is a compatible version ✔", node_vers);
        }
    }
    match args.command {
        DuniterXTaskCommand::Build { production } => build(args.skip_npm, production),
        DuniterXTaskCommand::Test => test(args.skip_npm),
    }
}

fn exec_and_get_stdout(command: &mut Command) -> Result<String> {
    let Output {
        status,
        stdout,
        stderr,
    } = command.output()?;

    if status.success() {
        Ok(String::from_utf8(stdout)
            .unwrap_or_else(|_| "Output is not a valid utf8 string".to_owned()))
    } else {
        eprintln!(
            "{}",
            String::from_utf8(stderr)
                .unwrap_or_else(|_| "Error message is not a valid utf8 string".to_owned())
        );
        std::process::exit(1);
    }
}

fn exec_should_success(command: &mut Command) -> Result<()> {
    if !command.status()?.success() {
        std::process::exit(1);
    } else {
        Ok(())
    }
}

fn build(skip_npm: bool, production: bool) -> Result<()> {
    if !skip_npm {
        exec_should_success(Command::new("npm").args(["add", "duniter-ui"]))?;
        exec_should_success(
            Command::new("npm")
                .env("NEON_BUILD_RELEASE", "true")
                .arg("ci"),
        )?;
        if production {
            exec_should_success(Command::new("npm").args(["prune", "--production"]))?;
        }
    }
    println!("Build duniter-cli …");
    exec_should_success(Command::new("cargo").args(["build", "--release"]))?;
    std::fs::copy("target/release/duniter", "bin/duniter")?;
    Ok(())
}

fn test(skip_npm: bool) -> Result<()> {
    exec_should_success(Command::new("cargo").args(["test", "--all"]))?;
    if !skip_npm {
        exec_should_success(Command::new("npm").arg("test"))?;
    }
    Ok(())
}

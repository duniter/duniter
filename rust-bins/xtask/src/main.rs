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

use std::{
    io::Result,
    process::{Command, Output},
};
use structopt::StructOpt;

const MIN_RUST_VERTION: &str = "1.47.0";
const NODE_VERSION: &str = "10.22.1";
const NVM_VERSION: &str = "0.35.3";

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

    if !version_check::is_min_version(MIN_RUST_VERTION).unwrap_or(false)
        && exec_should_success(Command::new("rustup").args(&["update", "stable"])).is_err()
    {
        eprintln!(
                "Duniter requires Rust {} or higher. If you installed the Rust toolchain via rustup, please execute the command `rustup update stable`.",
                MIN_RUST_VERTION
            );
        std::process::exit(1);
    }
    Command::new("rustc").arg("--version").status()?;
    Command::new("cargo").arg("--version").status()?;

    if !args.skip_npm {
        println!("Check node version …");
        if exec_and_get_stdout(Command::new("node").arg("-v"))
            .unwrap_or_default()
            .trim_end()
            != format!("v{}", NODE_VERSION)
        {
            println!("Install node v{} …", NODE_VERSION);
            install_and_use_node_version()?;
        } else {
            println!("Node v{} already installed ✔", NODE_VERSION);
        }
    }
    match args.command {
        DuniterXTaskCommand::Build { production } => build(args.skip_npm, production),
        DuniterXTaskCommand::Test => test(args.skip_npm),
    }
}

fn install_and_use_node_version() -> Result<()> {
    if exec_should_success(Command::new("nvm").arg("--version")).is_err() {
        println!("Install nvm v{} …", NVM_VERSION);
        let nvm_install_script = exec_and_get_stdout(Command::new("wget").args(&[
            "-qO-",
            &format!(
                "https://raw.githubusercontent.com/nvm-sh/nvm/v{}/install.sh",
                NVM_VERSION
            ),
        ]))?;
        exec_should_success(Command::new("bash").arg(nvm_install_script))?;
    }
    exec_should_success(Command::new("nvm").args(&["install", NODE_VERSION]))?;
    exec_should_success(Command::new("nvm").args(&["use", NODE_VERSION]))
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
        exec_should_success(Command::new("npm").args(&["add", "duniter-ui"]))?;
        exec_should_success(
            Command::new("npm")
                .env("NEON_BUILD_RELEASE", "true")
                .arg("install"),
        )?;
        if production {
            exec_should_success(Command::new("npm").args(&["prune", "--production"]))?;
        }
    }
    println!("Build duniter-launcher …");
    exec_should_success(Command::new("cargo").args(&["build", "--release"]))?;
    std::fs::copy("target/release/duniter", "bin/duniter")?;
    Ok(())
}

fn test(skip_npm: bool) -> Result<()> {
    exec_should_success(Command::new("cargo").args(&["test", "--all"]))?;
    if !skip_npm {
        exec_should_success(Command::new("npm").arg("test"))?;
    }
    Ok(())
}

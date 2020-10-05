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

#![deny(
    clippy::unwrap_used,
    missing_debug_implementations,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unsafe_code,
    unstable_features,
    unused_import_braces
)]

mod config;
mod daemon;
mod duniter_ts_args;
mod sync;

use anyhow::{anyhow, Result};
use daemonize_me::Daemon;
use logwatcher::{LogWatcher, LogWatcherAction};
use nix::{
    errno::Errno,
    sys::{signal::Signal, wait::WaitPidFlag, wait::WaitStatus},
    unistd::Pid,
    Error,
};
use std::{
    fs::File, io::prelude::*, path::Path, path::PathBuf, process::Command, process::Output,
    process::Stdio,
};
use structopt::{clap::Shell, StructOpt};

const APP_NAME: &str = "duniter";
const DEFAULT_PORT: u16 = 443;
const DEFAULT_PROFILE: &str = "duniter_default";
const DUNITER_EXE_PATH: &str = "/opt/duniter/bin/duniter";
const DUNITER_EXE_LINK_PATH: &str = "/usr/bin/duniter";
const DUNITER_JS_CURRENT_DIR: &str = "/opt/duniter/";
const DUNITER_JS_PATH: &str = "/opt/duniter/bin/duniter_js";
const DUNITER_JS_DEV_PATH: &str = "bin/duniter_js";
const EMBEDDED_NODE_PATH: &str = "/opt/duniter/node/bin/node";
const EXIT_CODE_DUNITER_NOT_RUNNING: i32 = 4;
const LOG_FILE: &str = "duniter.log";
const NODE_VERSION_BEGIN: &str = "v10.";

#[derive(StructOpt)]
#[structopt(name = APP_NAME, about = "Crypto-currency software to operate Ğ1 libre currency.")]
struct DuniterArgs {
    /// Path to Duniter HOME (defaults to "$HOME/.config/duniter").
    #[structopt(short, long, parse(from_os_str))]
    home: Option<PathBuf>,
    /// Logs level (If not specified, use the logs level defined in the configuration or INFO by default).
    #[structopt(short, long, alias("loglevel"), case_insensitive(true), possible_values = &["OFF", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"])]
    log: Option<log::LevelFilter>,
    /// Profile name (defauld "duniter_default")
    #[structopt(short, long, alias("mdb"))]
    profile: Option<String>,
    #[structopt(subcommand)]
    command: DuniterCommand,
}

#[derive(StructOpt)]
#[structopt(rename_all = "snake")]
enum DuniterCommand {
    /// Duniter configuration options.
    #[structopt(
        display_order(0),
        after_help("Some advanced options are hidden for readability.")
    )]
    Config(Box<config::DuniterConfigArgs>),
    /// Launch the configuration wizard.
    #[structopt(display_order(1))]
    Wizard(WizardCommand),
    /// WS2P operations for configuration and diagnosis tasks.
    #[structopt(display_order(2))]
    WS2P(WS2PCommand),
    /// Synchronize blockchain from a remote Duniter node.
    #[structopt(display_order(3))]
    Sync(sync::DuniterSyncArgs),
    /// Start Duniter node with direct output, non-daemonized.
    #[structopt(display_order(4))]
    DirectStart {
        /// Force to use the keypair given by user prompt.
        #[structopt(long)]
        keyprompt: bool,
        #[structopt(flatten)]
        start_args: DuniterStartArgs,
    },
    /// Start Duniter node with its web interface with direct output, non-daemonized.
    #[structopt(display_order(5))]
    DirectWebstart {
        /// Force to use the keypair given by user prompt.
        #[structopt(long)]
        keyprompt: bool,
        #[structopt(flatten)]
        start_args: DuniterStartArgs,
        #[structopt(flatten)]
        webstart_args: DuniterWebstartArgs,
    },
    /// Starts Duniter as a daemon (background task).
    #[structopt(display_order(6))]
    Start(DuniterStartArgs),
    /// Starts Duniter (with its web interface) as a daemon (background task).
    #[structopt(display_order(7))]
    Webstart {
        #[structopt(flatten)]
        start_args: DuniterStartArgs,
        #[structopt(flatten)]
        webstart_args: DuniterWebstartArgs,
    },
    /// Get Duniter daemon status.
    #[structopt(display_order(8))]
    Status,
    /// Follow duniter logs.
    #[structopt(display_order(9))]
    Logs,
    /// Stops Duniter daemon and restart it.
    #[structopt(display_order(10), alias = "webrestart")]
    Restart,
    /// Stops Duniter daemon if it is running.
    #[structopt(display_order(11))]
    Stop,
    /// Reset configuration, data, peers, transactions or everything in the database
    #[structopt(display_order(12))]
    Reset(ResetCommand),
    /// Generate tab-completion script for your shell
    #[structopt(display_order(13))]
    Completions {
        #[structopt(case_insensitive(true))]
        shell: Shell,
    },
}

#[derive(StructOpt)]
enum ResetCommand {
    #[structopt(display_order(0))]
    Config,
    #[structopt(display_order(1))]
    Data,
    #[structopt(display_order(2))]
    Peers,
    #[structopt(display_order(3))]
    Stats,
    #[structopt(display_order(4))]
    All,
}

#[derive(StructOpt)]
enum WizardCommand {
    #[structopt(display_order(0))]
    Key {
        /// Scrypt `N` CPU/memory cost parameter. Must be a power of 2. Defaults to 4096.
        #[structopt(short)]
        n: Option<usize>,
        /// "Scrypt `r` The blocksize parameter, which fine-tunes sequential memory read size and performance. Defaults to 16."
        #[structopt(short)]
        r: Option<usize>,
        /// Scrypt `p` Parallelization parameter. Defaults to 1.
        #[structopt(short)]
        p: Option<usize>,
    },
    #[structopt(display_order(1), alias = "network")]
    Bma,
}

#[derive(StructOpt)]
enum WS2PCommand {
    #[structopt(display_order(0))]
    ListNodes,
    #[structopt(display_order(0))]
    ListPrefered,
    #[structopt(display_order(0))]
    ListPrivileged,
    #[structopt(display_order(0))]
    ShowConf,
}

#[derive(StructOpt)]
struct DuniterStartArgs {
    /// Force to use the keypair of the given YAML file. File must contain `pub:` and `sec:` fields.
    #[structopt(long, parse(from_os_str), env("DUNITER_KEYFILE"))]
    keyfile: Option<PathBuf>,
}

#[derive(StructOpt)]
struct DuniterWebstartArgs {
    /// Web user interface host (IP) to listen to.
    #[structopt(long, alias = "webmhost", env("DUNITER_WEB_UI_HOST"))]
    web_ui_host: Option<String>,
    /// Web user interface port (IP) to listen to.
    #[structopt(long, alias = "webmport")]
    web_ui_port: Option<String>,
}

fn main() -> Result<()> {
    let args = DuniterArgs::from_args();

    if let DuniterCommand::Completions { shell } = args.command {
        DuniterArgs::clap().gen_completions_to(APP_NAME, shell, &mut std::io::stdout());
        Ok(())
    } else {
        let profile_path = get_profile_path(args.profile.as_deref())?;

        let current_exe = std::env::current_exe()?;
        let prod = current_exe == PathBuf::from(DUNITER_EXE_LINK_PATH)
            || current_exe == PathBuf::from(DUNITER_EXE_PATH);

        let duniter_ts_args = duniter_ts_args::gen_duniter_ts_args(&args, duniter_js_exe()?);

        match args.command {
            DuniterCommand::Restart => {
                daemon::start(prod, &profile_path, &daemon::stop(&profile_path)?)
            }
            DuniterCommand::Start(_) | DuniterCommand::Webstart { .. } => {
                daemon::start(prod, &profile_path, &duniter_ts_args)
            }
            DuniterCommand::Status => daemon::status(&profile_path),
            DuniterCommand::Stop => {
                daemon::stop(&profile_path)?;
                Ok(())
            }
            DuniterCommand::Logs => watch_logs(profile_path),
            _ => {
                ctrlc::set_handler(move || {
                    // This empty handler is necessary otherwise the Rust process is stopped immediately
                    // without waiting for the child process (duniter_js) to finish stopping.
                })?;
                let mut duniter_js_command = Command::new(get_node_path()?);
                if prod {
                    duniter_js_command.current_dir(DUNITER_JS_CURRENT_DIR);
                }
                let exit_code_opt = duniter_js_command.args(duniter_ts_args).status()?.code();
                if let Some(exit_code) = exit_code_opt {
                    std::process::exit(exit_code);
                } else {
                    Ok(())
                }
            }
        }
    }
}

fn duniter_js_exe() -> Result<String> {
    let current_exe = std::env::current_exe()?;
    Ok(
        if current_exe == PathBuf::from(DUNITER_EXE_LINK_PATH)
            || current_exe == PathBuf::from(DUNITER_EXE_PATH)
        {
            DUNITER_JS_PATH.to_owned()
        } else {
            DUNITER_JS_DEV_PATH.to_owned()
        },
    )
}

pub(crate) fn get_node_path() -> Result<&'static str> {
    let current_exe = std::env::current_exe()?;
    if current_exe == PathBuf::from(DUNITER_EXE_LINK_PATH)
        || current_exe == PathBuf::from(DUNITER_EXE_PATH)
    {
        let node_path = PathBuf::from(EMBEDDED_NODE_PATH);
        if node_path.exists() {
            Ok(EMBEDDED_NODE_PATH)
        } else {
            eprintln!("Node.js is not embedded in this version of Duniter");
            std::process::exit(1);
        }
    } else if get_node_version("node")?.starts_with(NODE_VERSION_BEGIN) {
        Ok("node")
    } else {
        eprintln!("Duniter require Node.js v10.x");
        std::process::exit(1);
    }
}

pub(crate) fn get_node_version(node_path: &str) -> Result<String> {
    let Output {
        status,
        stdout,
        stderr,
    } = Command::new(node_path).arg("-v").output()?;

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

fn get_profile_path(profile: Option<&str>) -> Result<PathBuf> {
    let mut profile_path = dirs::config_dir().expect("unsupported operating system");
    profile_path.push(APP_NAME);
    profile_path.push(profile.unwrap_or(DEFAULT_PROFILE));
    if !profile_path.exists() {
        std::fs::create_dir_all(&profile_path)?;
    }
    Ok(profile_path)
}

fn watch_logs(profile_path: PathBuf) -> Result<()> {
    let mut log_watcher = LogWatcher::register(profile_path.join(LOG_FILE))?;

    log_watcher.watch(&mut move |line: String| {
        println!("{}", line);
        LogWatcherAction::None
    });

    Ok(())
}

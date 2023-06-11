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

use crate::*;

fn gen_start_args(args: &DuniterStartArgs, duniter_ts_args: &mut Vec<String>) {
    if let Some(ref keyfile) = args.keyfile {
        duniter_ts_args.push("--keyfile".to_owned());
        duniter_ts_args.push(
            keyfile
                .to_str()
                .expect("keyfile path is invalid")
                .to_owned(),
        );
    }
}

fn gen_webstart_args(args: &DuniterWebstartArgs, duniter_ts_args: &mut Vec<String>) {
    if let Some(ref web_ui_host) = args.web_ui_host {
        duniter_ts_args.push("--webmhost".to_owned());
        duniter_ts_args.push(web_ui_host.into());
    }
    if let Some(ref web_ui_port) = args.web_ui_port {
        duniter_ts_args.push("--webmport".to_owned());
        duniter_ts_args.push(web_ui_port.into());
    }
}

pub(crate) fn gen_duniter_ts_args(
    args: &DuniterArgs,
    duniter_js_exe: String,
    log_level_filter: log::LevelFilter,
) -> Vec<String> {
    let max_old_space_size = args.max_old_space_size.unwrap_or(4096);
    let mut duniter_ts_args = vec![
        format!("--max-old-space-size={}", max_old_space_size),
        duniter_js_exe,
    ];
    if let Some(ref home) = args.home {
        duniter_ts_args.push("--home".to_owned());
        duniter_ts_args.push(home.to_str().expect("invalid home path").to_owned());
    }
    duniter_ts_args.push("--loglevel".to_owned());
    duniter_ts_args.push(log_level_filter.to_string().to_lowercase());
    if let Some(ref profile) = args.profile {
        duniter_ts_args.push("--mdb".to_owned());
        duniter_ts_args.push(profile.clone());
    }
    match args.command {
        DuniterCommand::Completions { .. } => unreachable!(),
        DuniterCommand::DirectStart {
            keyprompt,
            ref start_args,
        } => {
            duniter_ts_args.push("direct_start".to_owned());
            if keyprompt {
                duniter_ts_args.push("--keyprompt".to_owned());
            }
            gen_start_args(start_args, &mut duniter_ts_args);
        }
        DuniterCommand::DirectWebstart {
            keyprompt,
            ref start_args,
            ref webstart_args,
        } => {
            duniter_ts_args.push("direct_webstart".to_owned());
            if keyprompt {
                duniter_ts_args.push("--keyprompt".to_owned());
            }
            gen_start_args(start_args, &mut duniter_ts_args);
            gen_webstart_args(webstart_args, &mut duniter_ts_args);
        }
        DuniterCommand::Gva(_) => unreachable!(),
        DuniterCommand::Start(ref start_args) => {
            duniter_ts_args.push("direct_start".to_owned());
            gen_start_args(start_args, &mut duniter_ts_args);
        }
        DuniterCommand::Webstart {
            ref start_args,
            ref webstart_args,
        } => {
            duniter_ts_args.push("direct_webstart".to_owned());
            gen_start_args(start_args, &mut duniter_ts_args);
            gen_webstart_args(webstart_args, &mut duniter_ts_args);
        }
        DuniterCommand::Stop => duniter_ts_args.push("stop".to_owned()),
        DuniterCommand::Sync(ref sync_args) => {
            duniter_ts_args.push("sync".to_owned());
            sync::gen_args(sync_args, &mut duniter_ts_args);
        }
        DuniterCommand::Config(ref config_args) => {
            duniter_ts_args.push("config".to_owned());
            config::gen_args(config_args, &mut duniter_ts_args);
        }
        DuniterCommand::Reset(ref reset_command) => {
            duniter_ts_args.push("reset".to_owned());
            match reset_command {
                ResetCommand::Config => duniter_ts_args.push("config".to_owned()),
                ResetCommand::Data => duniter_ts_args.push("data".to_owned()),
                ResetCommand::Peers => duniter_ts_args.push("peers".to_owned()),
                ResetCommand::Stats => duniter_ts_args.push("stats".to_owned()),
                ResetCommand::All => duniter_ts_args.push("all".to_owned()),
            }
        }
        DuniterCommand::Wizard(ref wizard_command) => {
            duniter_ts_args.push("wizard".to_owned());
            match wizard_command {
                WizardCommand::Bma => duniter_ts_args.push("network".to_owned()),
                WizardCommand::Key { n, r, p } => {
                    duniter_ts_args.push("key".to_owned());
                    if let Some(n) = n {
                        duniter_ts_args.push("--keyN".to_owned());
                        duniter_ts_args.push(n.to_string());
                    }
                    if let Some(r) = r {
                        duniter_ts_args.push("--keyr".to_owned());
                        duniter_ts_args.push(r.to_string());
                    }
                    if let Some(p) = p {
                        duniter_ts_args.push("--keyp".to_owned());
                        duniter_ts_args.push(p.to_string());
                    }
                }
            }
        }
        DuniterCommand::WS2P(ref ws2p_command) => {
            duniter_ts_args.push("ws2p".to_owned());
            match ws2p_command {
                WS2PCommand::ListNodes => duniter_ts_args.push("list-nodes".to_owned()),
                WS2PCommand::ListPrefered => duniter_ts_args.push("list-prefered".to_owned()),
                WS2PCommand::ListPrivileged => duniter_ts_args.push("list-privileged".to_owned()),
                WS2PCommand::ShowConf => duniter_ts_args.push("show-conf".to_owned()),
            }
        }
        DuniterCommand::Logs | DuniterCommand::Restart | DuniterCommand::Status => {}
    }
    duniter_ts_args
}

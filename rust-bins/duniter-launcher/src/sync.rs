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

#[derive(StructOpt)]
pub(crate) struct DuniterSyncArgs {
    /// Check all DUPB rules (very long).
    #[structopt(hidden(true), long)]
    cautious: bool,
    /// Allow to synchronize on nodes with local network IP address.
    #[structopt(hidden(true), long)]
    localsync: bool,
    /// Disable interactive sync UI.
    #[structopt(long, alias = "nointeractive")]
    no_interactive: bool,
    /// Do not retrieve peers.
    #[structopt(long, alias = "nopeers")]
    no_peers: bool,
    /// Disables P2P downloading of blocs.
    #[structopt(long, alias = "nop2p")]
    no_p2p: bool,
    /// Do not retrieve sandboxes during sync.
    #[structopt(long, alias = "nosbx")]
    no_sandboxes: bool,
    /// Will only try to sync peers.
    #[structopt(long, alias = "onlypeers")]
    only_peers: bool,
    /// Download slowly the blokchcain (for low connnections).
    #[structopt(long)]
    slow: bool,
    // Host or directory
    source: String,
    /// Port
    port: Option<u16>,
}

pub(crate) fn gen_args(args: &DuniterSyncArgs, duniter_ts_args: &mut Vec<String>) {
    if args.source.contains(':') || args.source.contains('/') {
        duniter_ts_args.push(args.source.clone());
    } else {
        duniter_ts_args.push(format!(
            "{}:{}",
            args.source,
            args.port.unwrap_or(DEFAULT_PORT)
        ));
    }
    if args.cautious {
        duniter_ts_args.push("--cautious".into());
    }
    if args.localsync {
        duniter_ts_args.push("--localsync".into());
    }
    if args.no_interactive {
        duniter_ts_args.push("--nointeractive".into());
    }
    if args.no_peers {
        duniter_ts_args.push("--nopeers".into());
    }
    if args.no_p2p {
        duniter_ts_args.push("--nop2p".into());
    }
    if args.no_sandboxes {
        duniter_ts_args.push("--nosbx".into());
    }
    if args.only_peers {
        duniter_ts_args.push("--onlypeers".into());
    }
    if args.slow {
        duniter_ts_args.push("--slow".into());
    }
    todo!()
}

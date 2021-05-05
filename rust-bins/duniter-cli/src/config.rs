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

use std::str::FromStr;

use crate::*;

#[derive(Debug)]
struct Percent(pub usize);

impl FromStr for Percent {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let usize_: usize = s.parse()?;
        if usize_ <= 100 {
            Ok(Self(usize_))
        } else {
            Err(anyhow!("A percentage should be <= 100 !"))
        }
    }
}

#[derive(StructOpt)]
pub(crate) struct DuniterCoreConfigArgs {
    /// Percent of CPU usage for proof-of-work computation
    #[structopt(long)]
    cpu: Option<Percent>,
    /// Prefix node id for the first character of nonce
    #[structopt(long)]
    prefix: Option<usize>,
    /// Enable BMA API
    #[structopt(long, display_order(0))]
    bma: bool,
    /// Disable BMA API
    #[structopt(long, display_order(1), alias = "nobma", conflicts_with("bma"))]
    no_bma: bool,
    /// Use UPnP to open BMA remote port.
    #[structopt(long, display_order(2), alias = "upnp")]
    bma_upnp: bool,
    /// Do not use UPnP to open BMA remote port.
    #[structopt(long, display_order(3), alias = "noupnp", conflicts_with("bma-upnp"))]
    bma_no_upnp: bool,
    /// Enable WS2P Public access.
    #[structopt(long, display_order(4))]
    ws2p_public: bool,
    /// Disable WS2P Public access.
    #[structopt(
        long,
        display_order(5),
        alias = "ws2p-nopublic",
        conflicts_with("ws2p-public")
    )]
    ws2p_no_public: bool,
    /// Use UPnP to open WS2P remote port.
    #[structopt(long, display_order(6))]
    ws2p_upnp: bool,
    /// Do not use UPnP to open WS2P remote port.
    #[structopt(
        long,
        display_order(7),
        alias = "ws2p-noupnp",
        conflicts_with("ws2p-upnp")
    )]
    ws2p_no_upnp: bool,
    /// WS2P host to listen to.
    #[structopt(long)]
    ws2p_host: Option<String>,
    /// WS2P port to listen to.
    #[structopt(long)]
    ws2p_port: Option<u16>,
    /// WS2P availabily host.
    #[structopt(long)]
    ws2p_remote_host: Option<String>,
    /// WS2P availabily port.
    #[structopt(long)]
    ws2p_remote_port: Option<u16>,
    /// WS2P availabily path.
    #[structopt(long)]
    ws2p_remote_path: Option<String>,
    /// Maximum outcoming connections count.
    #[structopt(long)]
    ws2p_max_private: Option<u8>,
    /// Maximum incoming connections count.
    #[structopt(long)]
    ws2p_max_public: Option<u8>,

    // Hidden options
    /// Number of cores uses for proof-of-work computation
    #[structopt(long, hidden(true))]
    nb_cores: Option<usize>,
    /// Enable WS2P Private.
    #[structopt(long, hidden(true))]
    ws2p_private: bool,
    /// Disable WS2P Private.
    #[structopt(
        long,
        hidden(true),
        alias = "ws2p-noprivate",
        conflicts_with("ws2p-private")
    )]
    ws2p_no_private: bool,
    /// Add a preferred node to connect to through private access.
    #[structopt(long, hidden(true))]
    ws2p_prefered_add: Option<String>,
    /// Remove preferred node.
    #[structopt(long, hidden(true))]
    ws2p_prefered_rm: Option<String>,
    /// Only connect to preferred nodes.
    #[structopt(long, hidden(true))]
    ws2p_prefered_only: bool,
    /// Add a privileged node to for our public access.
    #[structopt(long, hidden(true))]
    ws2p_privileged_add: Option<String>,
    /// Remove privileged node.
    #[structopt(long, hidden(true))]
    ws2p_privileged_rm: Option<String>,
    /// Accept only connections from a privileged node.
    #[structopt(long, hidden(true))]
    ws2p_privileged_only: bool,
    /// Add given endpoint to the list of endpoints of this node.
    #[structopt(long, hidden(true))]
    addep: Option<String>,
    /// Remove given endpoint to the list of endpoints of this node.
    #[structopt(long, hidden(true))]
    remep: Option<String>,
    /// Use Socks Proxy for WS2P Private
    #[structopt(long, hidden(true), alias = "socks-proxy")]
    ws2p_socks_proxy: Option<String>,
    /// Use Tor Socks Proxy
    #[structopt(long, hidden(true))]
    tor_proxy: Option<String>,
    /// Method for reaching an clear endpoint
    #[structopt(long, hidden(true), possible_values = &["clear", "tor", "none"])]
    reaching_clear_ep: Option<String>,
    /// Remove all proxies
    #[structopt(long, hidden(true))]
    rm_proxies: bool,
    /// Force duniter to contact endpoint tor (if you redirect the traffic to tor yourself)
    #[structopt(long, hidden(true))]
    force_tor: bool,
}

pub(crate) fn gen_args(args: &DuniterCoreConfigArgs, duniter_js_args: &mut Vec<String>) {
    if let Some(Percent(cpu_percent)) = args.cpu {
        duniter_js_args.push("--cpu".into());
        duniter_js_args.push(cpu_percent.to_string());
    }
    if let Some(nb_cores) = args.nb_cores {
        duniter_js_args.push("--nb-cores".into());
        duniter_js_args.push(nb_cores.to_string());
    }
    if let Some(prefix) = args.prefix {
        duniter_js_args.push("--prefix".into());
        duniter_js_args.push(prefix.to_string());
    }
    if args.bma {
        duniter_js_args.push("--bma".into());
    } else if args.no_bma {
        duniter_js_args.push("--nobma".into());
    }
    if args.bma_upnp {
        duniter_js_args.push("--upnp".into());
    } else if args.bma_no_upnp {
        duniter_js_args.push("--noupnp".into());
    }
    if args.ws2p_upnp {
        duniter_js_args.push("--ws2p-upnp".into());
    } else if args.ws2p_no_upnp {
        duniter_js_args.push("--ws2p-noupnp".into());
    }
    if args.ws2p_private {
        duniter_js_args.push("--ws2p-private".into());
    } else if args.ws2p_no_private {
        duniter_js_args.push("--ws2p-noprivate".into());
    }
    if args.ws2p_public {
        duniter_js_args.push("--ws2p-public".into());
    } else if args.ws2p_no_public {
        duniter_js_args.push("--ws2p-nopublic".into());
    }
    if let Some(ref ws2p_host) = args.ws2p_host {
        duniter_js_args.push("--ws2p-host".into());
        duniter_js_args.push(ws2p_host.into());
    }
    if let Some(ws2p_port) = args.ws2p_port {
        duniter_js_args.push("--ws2p-port".into());
        duniter_js_args.push(ws2p_port.to_string());
    }
    if let Some(ref ws2p_remote_host) = args.ws2p_remote_host {
        duniter_js_args.push("--ws2p-remote-host".into());
        duniter_js_args.push(ws2p_remote_host.into());
    }
    if let Some(ws2p_remote_port) = args.ws2p_remote_port {
        duniter_js_args.push("--ws2p-remote-port".into());
        duniter_js_args.push(ws2p_remote_port.to_string());
    }
    if let Some(ref ws2p_remote_path) = args.ws2p_remote_path {
        duniter_js_args.push("--ws2p-remote-path".into());
        duniter_js_args.push(ws2p_remote_path.into());
    }
    if let Some(ref ws2p_max_private) = args.ws2p_max_private {
        duniter_js_args.push("--ws2p-max-private".into());
        duniter_js_args.push(ws2p_max_private.to_string());
    }
    if let Some(ref ws2p_max_public) = args.ws2p_max_public {
        duniter_js_args.push("--ws2p-max-public".into());
        duniter_js_args.push(ws2p_max_public.to_string());
    }
    if let Some(ref ws2p_prefered_add) = args.ws2p_prefered_add {
        duniter_js_args.push("--ws2p-prefered-add".into());
        duniter_js_args.push(ws2p_prefered_add.to_string());
    }
    if let Some(ref ws2p_prefered_rm) = args.ws2p_prefered_rm {
        duniter_js_args.push("--ws2p-prefered-rm".into());
        duniter_js_args.push(ws2p_prefered_rm.to_string());
    }
    if args.ws2p_prefered_only {
        duniter_js_args.push("--ws2p-prefered-only".into());
    }
    if let Some(ref ws2p_privileged_add) = args.ws2p_privileged_add {
        duniter_js_args.push("--ws2p-privileged-add".into());
        duniter_js_args.push(ws2p_privileged_add.to_string());
    }
    if let Some(ref ws2p_privileged_rm) = args.ws2p_privileged_rm {
        duniter_js_args.push("--ws2p-privileged-rm".into());
        duniter_js_args.push(ws2p_privileged_rm.to_string());
    }
    if args.ws2p_privileged_only {
        duniter_js_args.push("--ws2p-privileged-only".into());
    }
    if let Some(ref addep) = args.addep {
        duniter_js_args.push("--addep".into());
        duniter_js_args.push(addep.into());
    }
    if let Some(ref remep) = args.remep {
        duniter_js_args.push("--remep".into());
        duniter_js_args.push(remep.into());
    }
    if let Some(ref ws2p_socks_proxy) = args.ws2p_socks_proxy {
        duniter_js_args.push("--socks-proxy".into());
        duniter_js_args.push(ws2p_socks_proxy.into());
    }
    if let Some(ref tor_proxy) = args.tor_proxy {
        duniter_js_args.push("--tor-proxy".into());
        duniter_js_args.push(tor_proxy.into());
    }
    if let Some(ref reaching_clear_ep) = args.reaching_clear_ep {
        duniter_js_args.push("--reaching-clear-ep".into());
        duniter_js_args.push(reaching_clear_ep.into());
    }
    if args.rm_proxies {
        duniter_js_args.push("--rm-proxies".into());
    }
    if args.force_tor {
        duniter_js_args.push("--force-tor".into());
    }
}

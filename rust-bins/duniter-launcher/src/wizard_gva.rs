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
use read_input::prelude::*;
use std::{
    collections::HashSet,
    net::IpAddr,
    net::{Ipv4Addr, Ipv6Addr},
    str::FromStr,
};

/*
struct GvaConf {
    host: Option<String>,
    port: Option<u16>,
    path: Option<String>,
    subscriptions_path: Option<String>,
    remote_host: Option<String>,
    remote_port: Option<u16>,
    remote_path: Option<String>,
    remote_subscriptions_path: Option<String>,
    remote_tls: Option<bool>,
}
*/

pub(crate) fn wizard_gva(profile_name_opt: Option<&str>, profile_path: PathBuf) -> Result<()> {
    let file_path = profile_path.join("conf.json");

    if !file_path.exists() {
        if let Some(profile_name) = profile_name_opt {
            Command::new(duniter_js_exe()?)
                .args(&["--mdb", profile_name, "config"])
                .status()?;
        } else {
            Command::new(duniter_js_exe()?).arg("config").status()?;
        }
    }

    let mut file = File::open(file_path.as_path())?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;

    let mut conf_json = if contents.is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::Value::from_str(&contents)?
    };

    let conf_json_obj = conf_json
        .as_object_mut()
        .ok_or_else(|| anyhow::Error::msg("json conf must be an object"))?;

    // Get existing whitelist
    let mut whitelist = HashSet::new();
    if let Some(gva_conf) = conf_json_obj.get("gva") {
        let gva_conf_obj = gva_conf
            .as_object()
            .ok_or_else(|| anyhow::Error::msg("gva conf must be an object"))?;
        if let Some(whitelist_json) = gva_conf_obj.get("whitelist") {
            let whitelist_array = whitelist_json
                .as_array()
                .ok_or_else(|| anyhow::Error::msg("gva.whitelist must be an array"))?;
            for ip_json in whitelist_array {
                if let serde_json::Value::String(ip_str) = ip_json {
                    whitelist.insert(
                        IpAddr::from_str(ip_str).context("gva.whitelist contains invalid IP")?,
                    );
                }
            }
        } else {
            whitelist.insert(IpAddr::V4(Ipv4Addr::LOCALHOST));
            whitelist.insert(IpAddr::V6(Ipv6Addr::LOCALHOST));
        }
    } else {
        whitelist.insert(IpAddr::V4(Ipv4Addr::LOCALHOST));
        whitelist.insert(IpAddr::V6(Ipv6Addr::LOCALHOST));
    };

    let mut gva_conf = serde_json::Map::new();

    // Enable GVA API?
    let res = input().msg("Enable GVA API? [Y/n]").default('Y').get();
    let gva_enabled = res != 'n';
    gva_conf.insert("enabled".to_owned(), serde_json::Value::Bool(gva_enabled));

    if gva_enabled {
        // ip4
        let ip4 = input()
            .msg("Listen to ip v4 ? [127.0.0.1]")
            .default(Ipv4Addr::LOCALHOST)
            .get();
        gva_conf.insert("ip4".to_owned(), serde_json::Value::String(ip4.to_string()));
        // ip6
        let res = input().msg("Listen to ip v6? [Y/n]").default('Y').get();
        if res != 'n' {
            let ip6 = input()
                .msg("Enter ip v6: [::1]")
                .default(Ipv6Addr::LOCALHOST)
                .get();
            gva_conf.insert("ip6".to_owned(), serde_json::Value::String(ip6.to_string()));
        }
        // port
        let port = input()
            .msg("Listen to port ? [30901]")
            .default(30901u16)
            .get();
        gva_conf.insert(
            "port".to_owned(),
            serde_json::Value::Number(serde_json::Number::from(port)),
        );
        // path
        let path = input().msg("Path ? [gva]").default("gva".to_owned()).get();
        gva_conf.insert("path".to_owned(), serde_json::Value::String(path));
        // subscriptionsPath
        let subscriptions_path = input()
            .msg("Subscriptions path ? [gva-sub]")
            .default("gva-sub".to_owned())
            .get();
        gva_conf.insert(
            "subscriptionsPath".to_owned(),
            serde_json::Value::String(subscriptions_path),
        );
        // remoteHost
        let res = input()
            .msg("Define a remote host? [y/N]")
            .default('N')
            .get();
        if res == 'y' || res == 'Y' {
            let remote_host = input().msg("Enter remote host:").get();
            gva_conf.insert(
                "remoteHost".to_owned(),
                serde_json::Value::String(remote_host),
            );
        }
        // remotePort
        let res = input()
            .msg("Define a remote port? [y/N]")
            .default('N')
            .get();
        if res == 'y' || res == 'Y' {
            let remote_port = input()
                .msg("Enter remote port ? [443]")
                .default(443u16)
                .get();
            gva_conf.insert(
                "remotePort".to_owned(),
                serde_json::Value::Number(serde_json::Number::from(remote_port)),
            );
        }
        // remotePath
        let res = input()
            .msg("Define a remote path? [y/N]")
            .default('N')
            .get();
        if res == 'y' || res == 'Y' {
            let remote_path = input().msg("Enter remote path:").get();
            gva_conf.insert(
                "remotePath".to_owned(),
                serde_json::Value::String(remote_path),
            );
        }
        // remoteSubscriptionsPath
        let res = input()
            .msg("Define a remote subscriptions path? [y/N]")
            .default('N')
            .get();
        if res == 'y' || res == 'Y' {
            let remote_path = input().msg("Enter remote subscriptions path:").get();
            gva_conf.insert(
                "remoteSubscriptionsPath".to_owned(),
                serde_json::Value::String(remote_path),
            );
        }
        // whitelist
        let res = input().msg("Update whitelist? [y/N]").default('N').get();
        if res == 'y' || res == 'Y' {
            loop {
                println!("1. See whitelist content.");
                println!("2. Add an IP to the whitelist.");
                println!("3. Removing an IP from the whitelist.");
                println!("4. Quit.");
                match input().msg("Choose an action: ").default(1).get() {
                    2usize => {
                        whitelist.insert(input().msg("Enter a new IP address: ").get());
                    }
                    3 => {
                        whitelist
                            .remove(&input().msg("Indicate the IP address to be deleted: ").get());
                    }
                    4 => break,
                    _ => {
                        println!("--------------------------------");
                        println!("Whitelist content ({} IPs):", whitelist.len());
                        whitelist.iter().for_each(|ip| println!("{}", ip));
                        println!("--------------------------------");
                    }
                }
            }
        }
        gva_conf.insert(
            "whitelist".to_owned(),
            serde_json::Value::Array(
                whitelist
                    .into_iter()
                    .map(|ip| serde_json::Value::String(ip.to_string()))
                    .collect(),
            ),
        );
    }

    // Insert GVA json conf in global json conf
    conf_json_obj.insert("gva".to_owned(), serde_json::Value::Object(gva_conf));

    // Write new_conf
    let new_conf_str = serde_json::to_string_pretty(&conf_json)?;
    let mut file = File::create(file_path.as_path())?;
    file.write_all(new_conf_str.as_bytes())?;

    println!("Configuration successfully updated.");

    Ok(())
}

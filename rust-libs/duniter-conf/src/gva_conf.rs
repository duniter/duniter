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

use std::net::{Ipv4Addr, Ipv6Addr};

use crate::*;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GvaConf {
    ip4: Option<Ipv4Addr>,
    ip6: Option<Ipv6Addr>,
    port: Option<u16>,
    path: Option<String>,
    subscriptions_path: Option<String>,
    remote_host: Option<String>,
    remote_port: Option<u16>,
    remote_path: Option<String>,
    remote_subscriptions_path: Option<String>,
    remote_tls: Option<bool>,
}

impl GvaConf {
    pub fn get_ip4(&self) -> Ipv4Addr {
        self.ip4.unwrap_or(Ipv4Addr::LOCALHOST)
    }
    pub fn get_ip6(&self) -> Option<Ipv6Addr> {
        self.ip6
    }
    pub fn get_port(&self) -> u16 {
        self.port.unwrap_or(30901)
    }
    pub fn get_path(&self) -> String {
        if let Some(mut path) = self.path.clone() {
            if path.starts_with('/') {
                path.remove(0);
                path
            } else {
                path
            }
        } else {
            "localhost".to_owned()
        }
    }
    pub fn get_subscriptions_path(&self) -> String {
        if let Some(mut subscriptions_path) = self.subscriptions_path.clone() {
            if subscriptions_path.starts_with('/') {
                subscriptions_path.remove(0);
                subscriptions_path
            } else {
                subscriptions_path
            }
        } else {
            "localhost".to_owned()
        }
    }
    pub fn get_remote_host(&self) -> String {
        if let Some(ref remote_host) = self.remote_host {
            remote_host.to_owned()
        } else if let Some(ip6) = self.ip6 {
            format!("{} [{}]", self.get_ip4(), ip6)
        } else {
            self.get_ip4().to_string()
        }
    }
    pub fn get_remote_port(&self) -> u16 {
        if let Some(remote_port) = self.remote_port {
            remote_port
        } else {
            self.get_port()
        }
    }
    pub fn get_remote_path(&self) -> String {
        if let Some(ref remote_path) = self.remote_path {
            remote_path.to_owned()
        } else {
            self.get_path()
        }
    }
    pub fn get_remote_subscriptions_path(&self) -> String {
        if let Some(ref remote_subscriptions_path) = self.remote_subscriptions_path {
            remote_subscriptions_path.to_owned()
        } else {
            self.get_subscriptions_path()
        }
    }
    pub fn get_remote_tls(&self) -> bool {
        self.remote_tls.unwrap_or(false)
    }
}

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
use async_mutex::Mutex;
use duniter_dbs::kv_typed::prelude::Arc;
use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    time::Duration,
    time::Instant,
};

const COUNT_INTERVAL: usize = 40;
const MIN_DURATION_INTERVAL: Duration = Duration::from_secs(20);
const LARGE_DURATION_INTERVAL: Duration = Duration::from_secs(180);
const REDUCED_COUNT_INTERVAL: usize = COUNT_INTERVAL - 5;
const MAX_BAN_COUNT: usize = 16;
const BAN_FORGET_MIN_DURATION: Duration = Duration::from_secs(180);

#[derive(Clone)]
pub(crate) struct AntiSpam {
    state: Arc<Mutex<AntiSpamInner>>,
    whitelist: HashSet<IpAddr>,
}

struct AntiSpamInner {
    ban: HashMap<IpAddr, (bool, usize, Instant)>,
    ips_time: HashMap<IpAddr, (usize, Instant)>,
}

impl From<&GvaConf> for AntiSpam {
    fn from(conf: &GvaConf) -> Self {
        AntiSpam {
            state: Arc::new(Mutex::new(AntiSpamInner {
                ban: HashMap::with_capacity(10),
                ips_time: HashMap::with_capacity(10),
            })),
            whitelist: conf.get_whitelist().iter().copied().collect(),
        }
    }
}

impl AntiSpam {
    fn verify_interval(ip: IpAddr, state: &mut AntiSpamInner, ban_count: usize) -> bool {
        if let Some((count, instant)) = state.ips_time.get(&ip).copied() {
            if count == COUNT_INTERVAL {
                let duration = Instant::now().duration_since(instant);
                if duration > MIN_DURATION_INTERVAL {
                    if duration > LARGE_DURATION_INTERVAL {
                        state.ips_time.insert(ip, (1, Instant::now()));
                        true
                    } else {
                        state
                            .ips_time
                            .insert(ip, (REDUCED_COUNT_INTERVAL, Instant::now()));
                        true
                    }
                } else {
                    state.ban.insert(ip, (true, ban_count, Instant::now()));
                    false
                }
            } else {
                state.ips_time.insert(ip, (count + 1, instant));
                true
            }
        } else {
            state.ips_time.insert(ip, (1, Instant::now()));
            true
        }
    }
    pub(crate) async fn verify(&self, remote_addr_opt: Option<std::net::IpAddr>) -> bool {
        if let Some(ip) = remote_addr_opt {
            log::trace!("GVA: receive request from {}", ip);
            if self.whitelist.contains(&ip) {
                true
            } else {
                let mut guard = self.state.lock().await;
                if let Some((is_banned, ban_count, instant)) = guard.ban.get(&ip).copied() {
                    let ban_duration =
                        Duration::from_secs(1 << std::cmp::min(ban_count, MAX_BAN_COUNT));
                    if is_banned {
                        if Instant::now().duration_since(instant) > ban_duration {
                            guard.ban.insert(ip, (false, ban_count + 1, Instant::now()));
                            guard.ips_time.insert(ip, (1, Instant::now()));
                            true
                        } else {
                            guard.ban.insert(ip, (true, ban_count + 1, Instant::now()));
                            false
                        }
                    } else if Instant::now().duration_since(instant)
                        > std::cmp::max(ban_duration, BAN_FORGET_MIN_DURATION)
                    {
                        guard.ban.remove(&ip);
                        guard.ips_time.insert(ip, (1, Instant::now()));
                        true
                    } else {
                        Self::verify_interval(ip, &mut guard, ban_count)
                    }
                } else {
                    Self::verify_interval(ip, &mut guard, 0)
                }
            }
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use tokio::time::delay_for;

    const LOCAL_IP4: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);
    const LOCAL_IP6: IpAddr = IpAddr::V6(Ipv6Addr::LOCALHOST);

    #[tokio::test]
    async fn test_anti_spam() {
        let anti_spam = AntiSpam::from(&GvaConf::default());
        assert!(!anti_spam.verify(None).await);

        for _ in 0..(COUNT_INTERVAL * 2) {
            assert!(anti_spam.verify(Some(LOCAL_IP4)).await);
            assert!(anti_spam.verify(Some(LOCAL_IP6)).await);
        }

        let extern_ip = IpAddr::V4(Ipv4Addr::UNSPECIFIED);

        // Consume max queries
        for _ in 0..COUNT_INTERVAL {
            assert!(anti_spam.verify(Some(extern_ip)).await);
        }
        // Should be banned
        assert!(!anti_spam.verify(Some(extern_ip)).await);

        // Should be un-banned after one second
        delay_for(Duration::from_millis(1_100)).await;
        // Re-consume max queries
        for _ in 0..COUNT_INTERVAL {
            assert!(anti_spam.verify(Some(extern_ip)).await);
        }
        // Should be banned for 2 seconds this time
        delay_for(Duration::from_millis(1_100)).await;
        // Attempting a request when I'm banned must be twice my banning time
        assert!(!anti_spam.verify(Some(extern_ip)).await);
        delay_for(Duration::from_millis(4_100)).await;
        // Re-consume max queries
        for _ in 0..COUNT_INTERVAL {
            assert!(anti_spam.verify(Some(extern_ip)).await);
        }
    }
}

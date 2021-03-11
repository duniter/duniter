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

use std::net::{IpAddr, SocketAddr};

use crate::anti_spam::{AntiSpam, AntiSpamResponse};
use crate::*;

pub struct BadRequest(pub anyhow::Error);

impl std::fmt::Debug for BadRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl warp::reject::Reject for BadRequest {}

struct GraphQlRequest {
    inner: async_graphql::BatchRequest,
}

impl GraphQlRequest {
    fn data<D: std::any::Any + Copy + Send + Sync>(self, data: D) -> Self {
        match self.inner {
            async_graphql::BatchRequest::Single(request) => {
                Self::new(async_graphql::BatchRequest::Single(request.data(data)))
            }
            async_graphql::BatchRequest::Batch(requests) => {
                Self::new(async_graphql::BatchRequest::Batch(
                    requests.into_iter().map(|req| req.data(data)).collect(),
                ))
            }
        }
    }
    #[allow(clippy::from_iter_instead_of_collect)]
    async fn execute(self, schema: GvaSchema) -> async_graphql::BatchResponse {
        use std::iter::FromIterator as _;
        match self.inner {
            async_graphql::BatchRequest::Single(request) => {
                async_graphql::BatchResponse::Single(schema.execute(request).await)
            }
            async_graphql::BatchRequest::Batch(requests) => async_graphql::BatchResponse::Batch(
                futures::stream::FuturesOrdered::from_iter(
                    requests
                        .into_iter()
                        .zip(std::iter::repeat(schema))
                        .map(|(request, schema)| async move { schema.execute(request).await }),
                )
                .collect()
                .await,
            ),
        }
    }
    fn len(&self) -> usize {
        match &self.inner {
            async_graphql::BatchRequest::Single(_) => 1,
            async_graphql::BatchRequest::Batch(requests) => requests.len(),
        }
    }
    fn new(inner: async_graphql::BatchRequest) -> Self {
        Self { inner }
    }
    fn single(request: async_graphql::Request) -> Self {
        Self::new(async_graphql::BatchRequest::Single(request))
    }
}

struct GraphQlResponse(async_graphql::BatchResponse);
impl warp::reply::Reply for GraphQlResponse {
    fn into_response(self) -> warp::reply::Response {
        let mut resp = warp::reply::with_header(
            warp::reply::json(&self.0),
            "content-type",
            "application/json",
        )
        .into_response();
        add_cache_control_batch(&mut resp, &self.0);
        resp
    }
}

fn add_cache_control_batch(
    http_resp: &mut warp::reply::Response,
    batch_resp: &async_graphql::BatchResponse,
) {
    match batch_resp {
        async_graphql::BatchResponse::Single(resp) => add_cache_control(http_resp, resp),
        async_graphql::BatchResponse::Batch(resps) => {
            for resp in resps {
                add_cache_control(http_resp, resp)
            }
        }
    }
}

fn add_cache_control(http_resp: &mut warp::reply::Response, resp: &async_graphql::Response) {
    if resp.is_ok() {
        if let Some(cache_control) = resp.cache_control.value() {
            if let Ok(value) = cache_control.parse() {
                http_resp.headers_mut().insert("cache-control", value);
            }
        }
    }
}

pub(crate) fn graphql(
    conf: &GvaConf,
    schema: GvaSchema,
    opts: async_graphql::http::MultipartOptions,
) -> impl warp::Filter<Extract = (impl warp::Reply,), Error = Rejection> + Clone {
    let anti_spam = AntiSpam::from(conf);
    let opts = Arc::new(opts);
    warp::path::path(conf.get_path())
        .and(warp::method())
        .and(warp::query::raw().or(warp::any().map(String::new)).unify())
        .and(warp::addr::remote())
        .and(warp::header::optional::<IpAddr>("X-Real-IP"))
        .and(warp::header::optional::<String>("content-type"))
        .and(warp::body::stream())
        .and(warp::any().map(move || opts.clone()))
        .and(warp::any().map(move || schema.clone()))
        .and(warp::any().map(move || anti_spam.clone()))
        .and_then(
            |method,
             query: String,
             remote_addr: Option<SocketAddr>,
             x_real_ip: Option<IpAddr>,
             content_type,
             body,
             opts: Arc<async_graphql::http::MultipartOptions>,
             schema,
             anti_spam: AntiSpam| async move {
                let AntiSpamResponse {
                    is_whitelisted,
                    is_ok,
                } = anti_spam
                    .verify(x_real_ip.or_else(|| remote_addr.map(|ra| ra.ip())))
                    .await;
                if is_ok {
                    if method == http::Method::GET {
                        let request: async_graphql::Request = serde_urlencoded::from_str(&query)
                            .map_err(|err| warp::reject::custom(BadRequest(err.into())))?;
                        Ok::<_, Rejection>((
                            schema,
                            GraphQlRequest::single(request.data(QueryContext { is_whitelisted })),
                        ))
                    } else {
                        let batch_request = GraphQlRequest::new(
                            async_graphql::http::receive_batch_body(
                                content_type,
                                futures::TryStreamExt::map_err(body, |err| {
                                    std::io::Error::new(std::io::ErrorKind::Other, err)
                                })
                                .map_ok(|mut buf| {
                                    let remaining = warp::Buf::remaining(&buf);
                                    warp::Buf::copy_to_bytes(&mut buf, remaining)
                                })
                                .into_async_read(),
                                async_graphql::http::MultipartOptions::clone(&opts),
                            )
                            .await
                            .map_err(|err| warp::reject::custom(BadRequest(err.into())))?,
                        );
                        if is_whitelisted || batch_request.len() <= anti_spam::MAX_BATCH_SIZE {
                            Ok::<_, Rejection>((
                                schema,
                                batch_request.data(QueryContext { is_whitelisted }),
                            ))
                        } else {
                            Err(warp::reject::custom(BadRequest(anyhow::Error::msg(
                                r#"{ "error": "The batch contains too many requests" }"#,
                            ))))
                        }
                    }
                } else {
                    Err(warp::reject::custom(BadRequest(anyhow::Error::msg(
                        r#"{ "error": "too many requests" }"#,
                    ))))
                }
            },
        )
        .and_then(
            |(schema, batch_requests): (GvaSchema, GraphQlRequest)| async move {
                Ok::<_, Infallible>(GraphQlResponse(batch_requests.execute(schema).await))
            },
        )
}

pub(crate) fn graphql_ws(
    conf: &GvaConf,
    schema: GvaSchema,
) -> impl warp::Filter<Extract = (impl warp::Reply,), Error = Rejection> + Clone {
    let anti_spam = AntiSpam::from(conf);
    warp::path::path(conf.get_subscriptions_path())
        .and(warp::addr::remote())
        .and(warp::header::optional::<IpAddr>("X-Real-IP"))
        .and(warp::ws())
        .and(warp::any().map(move || schema.clone()))
        .and(warp::any().map(move || anti_spam.clone()))
        .and_then(
            |remote_addr: Option<SocketAddr>,
             x_real_ip: Option<IpAddr>,
             ws: warp::ws::Ws,
             schema: GvaSchema,
             anti_spam: AntiSpam| async move {
                let AntiSpamResponse {
                    is_whitelisted: _,
                    is_ok,
                } = anti_spam
                    .verify(x_real_ip.or_else(|| remote_addr.map(|ra| ra.ip())))
                    .await;
                if is_ok {
                    Ok((ws, schema))
                } else {
                    Err(warp::reject::custom(BadRequest(anyhow::Error::msg(
                        r#"{ "error": "too many requests" }"#,
                    ))))
                }
            },
        )
        .and_then(|(ws, schema): (warp::ws::Ws, GvaSchema)| {
            let reply = ws.on_upgrade(move |websocket| {
                let (ws_sender, ws_receiver) = websocket.split();

                async move {
                    let _ = async_graphql::http::WebSocket::new(
                        schema,
                        ws_receiver
                            .take_while(|msg| futures::future::ready(msg.is_ok()))
                            .map(Result::unwrap)
                            .map(warp::ws::Message::into_bytes),
                        async_graphql::http::WebSocketProtocols::SubscriptionsTransportWS,
                    )
                    .map(warp::ws::Message::text)
                    .map(Ok)
                    .forward(ws_sender)
                    .await;
                }
            });

            futures::future::ready(Ok::<_, Rejection>(warp::reply::with_header(
                reply,
                "Sec-WebSocket-Protocol",
                "graphql-ws",
            )))
        })
}

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

pub(crate) struct AsyncReader<R: futures::AsyncRead + Unpin>(pub(crate) R);

impl<R: futures::AsyncRead + Unpin> tokio::io::AsyncRead for AsyncReader<R> {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match <R as futures::AsyncRead>::poll_read(
            std::pin::Pin::new(&mut self.0),
            cx,
            buf.initialize_unfilled(),
        ) {
            std::task::Poll::Ready(res) => std::task::Poll::Ready(res.map(|n| buf.advance(n))),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

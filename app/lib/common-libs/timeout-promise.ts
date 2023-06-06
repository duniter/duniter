// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

export function newRejectTimeoutPromise(timeout: number) {
  return new Promise<void>((res, rej) => {
    setTimeout(rej, timeout);
  });
}

export function newResolveTimeoutPromise<T>(
  timeout: number,
  value: T
): Promise<T> {
  return new Promise<T>((res) => {
    setTimeout(() => res(value), timeout);
  });
}

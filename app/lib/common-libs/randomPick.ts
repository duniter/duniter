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

export const randomPick = <T>(elements: T[], max: number) => {
  const chosen: T[] = [];
  const nbElements = elements.length;
  for (let i = 0; i < Math.min(nbElements, max); i++) {
    const randIndex = Math.max(
      Math.floor(Math.random() * 10) - (10 - nbElements) - i,
      0
    );
    chosen.push(elements[randIndex]);
    elements.splice(randIndex, 1);
  }
  return chosen;
};

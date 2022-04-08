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

import {parsers} from "../../../app/lib/common-libs/parsers/index"

const should  = require('should');

const raw = "Version: 12\n" +
    "Type: Block\n" +
    "Currency: g1\n" +
    "Number: 514924\n" +
    "PoWMin: 107\n" +
    "Time: 1649350123\n" +
    "MedianTime: 1649341555\n" +
    "UnitBase: 0\n" +
    "Issuer: 6v9zutCfuihSBfu2wb7LSybtJwSFV3AhHv9EVAUL9mzc\n" +
    "IssuersFrame: 132\n" +
    "IssuersFrameVar: 9\n" +
    "DifferentIssuersCount: 28\n" +
    "PreviousHash: 0000003C52412C5E1A3F5623D450F6FDE33EFEABD9394564DBF3415106F11326\n" +
    "PreviousIssuer: VxCoqfTQRaPaiAc1Am2Z7gtbN2LaNm6RV19Ycfb8dFL\n" +
    "MembersCount: 4845\n" +
    "Identities:\n" +
    "Joiners:\n" +
    "Actives:\n" +
    "Leavers:\n" +
    "D68EcHtiDh1LF74TaNhmZd9R242L8xUbCREM6PS36F3H:iwy6N+IVc0bCqu7JqALzfEFWAaaJO1oj0d8ZaHQlOePl3UV4RHZb2XmMB8hALeVUK2B0+FzVWAogxnpDApcYCw==:514916-000000063FBB37691C2E06EAAF3D99D3457AD2354B0D0BBDD077FB6EE6397AFA:278989-000000B80F3A716C7AC4BC70333DB3F5FE94139A1BC678ED3795DF7CE029D82E:lauhhann\n" +
    "Revoked:\n" +
    "Excluded:\n" +
    "Certifications:\n" +
    "EpgZeL9Pts68uhZQ5Z6CHCHjfyiysqQULtvtXXJVPg2:DTgQ97AuJ8UgVXcxmNtULAs8Fg1kKC1Wr9SAS96Br9NG:514917:hZDIY1Gmo/2SANCj5rzVEdSJcBQk0srOLomlvtLv7SlOojWJ/k/dQI0EXG2U7lVTGcbcSpHhVdO6MKgVs7vWAA==\n" +
    "78iKYpug8JXRCwaeE7GK9gZLB8BqJkdCKMh1FJugBT5x:AruGq9VwaG4AVPthsmSekHjr6S3HfLgCz3NbvnhGoGi:514917:QK30J6Z7X0OK3kI46avmJrDiOtGcFbA+iFVpRLZXdFsSc3nGOoWSra22ACCCKTBbxUPYL854SAYLh0DUs+ZnBg==\n" +
    "AFv1D5xA7FCdHCTA1bqfQ3PWvwEM16Gw67QJ37obGnsv:5seBQtApt43EoVjRR8eTJaDtg8x8sMXWX3KjGsuJjNnV:514917:+QISXljj1yWu/a+jZWxhd15hAq2y5J8HAEYw3fMuU+nEH1j8bOjnGAv+jUX3xf5vbIDw4Qk/GJduD2Fl3l9RBA==\n" +
    "JEEXYE1Mv7nmqdmwqm7tqF92r8kT4BiLWWzmPSUZVJBw:ZVaxzHx6S9NjqvoRAmqSVrk39aQhNRCy4y6VYpiaJ11:514917:Jb59elTvSLdriKTtGW2am9yKdJl0jLeNuoSBMNTSPo4YHyaqeoWF9YUOz7pZOz7OmDNxg50jteoCWAPqSzhcDw==\n" +
    "2D2EfhxP2SjrynUBLjWRSwFtrPKJZ9Ggg9qFsFMzp1F3:H4gzARZTQqgvjkEQTxKRrfLAmconZzoBWa7bfsGuy3Xz:514916:MZ8qm8yM9wuq76jzivpT952U+ayVJmFj2AfuZ9Wn+cyeqdHgt28A+WmrRwflo+AzyM+QWKvBVBnJy0TSAAErAA==\n" +
    "CWUCpxKSE1KF7GkuJvLk5ViQvrjwxrpaFq8smbLmehWM:8gundJEbfm73Kx3jjw8YivJyz8qD2igjf6baCBLFCxPU:514916:M6WvtgX+tLiWQYl+irtZopOYRxss0aIk5jLenx+Vte/h4BbI0SgcPlbibpFJaBYxGRi7fGzMiQxM7bw1svlhDw==\n" +
    "B5JDrhYExPDREPKZCE6iQRdhjewJF8rNR2AraHkZK3yy:8gundJEbfm73Kx3jjw8YivJyz8qD2igjf6baCBLFCxPU:514916:Qwv4UEZb0CjGLGb7DUidNAvHr3GdiDVVLMDeTRP5tgcrw919gv4tsAkYSbZRoK/VM3OLluSx0Hzo8voTyZmICA==\n" +
    "2jVPEB28k36eK7uwifhxCViNPWLLv6zbLbnY7UXzvSTF:AqY67mqFJwiUMSSpvSTNSCiPqF3ANApheK5n6tu6jDwt:514916:PKmh4TqpRL1ELvc/EAzTup6eCRDAPMxtGTzbzvqYSAjkOEUEb7sX3dAbG9DFY6UGwZF3JUFUfKeEMb7Dfge4Aw==\n" +
    "4VZkro3N7VonygybESHngKUABA6gSrbW77Ktb94zE969:dduLAxqgjupQbjXiqC2tda5ki7WwJxGRdw8Z37uDGdM:514916:ZfknAPJlV3T3GafRwrtMV4x+p5nfSsfSPm+du7BCoOy5FGlIJW2LY8WQuuC3Xf8SsvB5MCMXIuWMNmOZuMm6Aw==\n" +
    "7YschDTUmy13KZQzrDzNkvDE43RzK6JtUqPvSuiqoqZi:dduLAxqgjupQbjXiqC2tda5ki7WwJxGRdw8Z37uDGdM:514916:WrHHXYU8FAoasxlavrmGwbx6B4Cgtt8/rsd+kYwiUCCIwLlxdzzb9vcoby+X4XX8YNQfgDtsf2SFwBEaLCh/CQ==\n" +
    "HhkWzCSdeq2sRWPXJyCczrt3HEq12iFdpGX5mDxysNFw:2mKmto464oWCVsRgcYM6vpwsLsGk6MhMtrBKf7DTAU34:514916:xcyWzD1js0GSTWmZPpidhSDn8j0gX60To8jVmgJIaR7+slGDNBoKTmuPzARIDRIRAE+xPPoYgdeJQB/COBJECg==\n" +
    "8Qbm7qbW7KvMdjupj92VpGF3pMpELMxfyHGERiYdkf2c:E29riVm5u4Tmtb8xUFgq7RMdqDjmXC1PiLFqiiyCtQVA:514916:Y7T6qw55yxMgr5qT2hUsfVBTUFfcJuCraJLOhyQsqJFBzHOHeu8Hp61vl+v/wVoYiLWS85C9E5LHgffoFaWBAQ==\n" +
    "CNnTusBEMwNMmpuhescH9WtiP5gWGCjGTp8SMkFWyf1m:F8if4j8PeUXvzT7mJwEe6uAAimqiYmBQpbP3J3Yk6cmG:514916:RDV7pPyBWpkcEjZpXCPlx6f/XlZkwZ84c++G6druEwntK6T3Bc5dNJr1852g9ubETCcKrOrbQxuL+RNqPDAQDQ==\n" +
    "X62AEYjC9mKx4yYvHwAVkxjpHpYRWSWB3nPM2bmcqBg:7icbSjbsbCr5UYNwfAuHXLHd3EgL6Dt2k6211Zf6FQWX:514916:UlBA5lbUv352O01ahldKSR/gTPlvAg6WKDcbRsRUn9Tdmwx/EDKkVzu3lCWHOv0LBo9Iy7TDPktcg6BHWgQfAw==\n" +
    "BaCxMx4z1RGZ7a2Gv4voXJDhXHtdJuww9odEtZDZWycs:6iPzmAzWoRDApfbLd3HwqhMsqEKk5PaN9Kn6SMC8nfPR:514915:usP+g0ck0v9XbkLSCn606e9ES6A8++msveC1erdkelk1Yf55Bppkh419nJ9Uk32F36K6XkCV5dd9sEWiz1J0Cw==\n" +
    "3qyesTqvjAXQ98eCaQLutgXws3vXD6giydWkuSMTi1Yi:C4D3ykicaK5YDs9yTGEURnihCRfVxa36BAhRe2MEG8yq:514915:zmFhxkUhC59awgxEXRUSIVpdOi0mSVT2iDJFGZUvq1zIKDoETEuep9ECHwyMVsVgP0nfhD9QTUOT7JD9jp6/Bw==\n" +
    "9ufook8M13swNLTL2PjZyQ6fScnGqUXntuQvNLEw8kfH:J2d9p3kABRZRivuxVCsfqYJKz78Z3MSFHVf8ZmgVCs73:514915:KG7m/6/caOnv3FrljSWcXySTiYriKLwUwOGxwSwTaZSnTXJsYBI9gJvXUkPsSZ5+fk5QTVwK4zBzo9nKTsKiAQ==\n" +
    "DZFYkGwyrt4FMxAsxK4NKRRKTKGSEhRMkLEmt4bSuw1h:DLXxZ6shCHkC5J8vLC3iVYW89BanaEMyKfpdz3h3fteh:514914:uGG5Fy9becN0POHtMxvg4JTN9NmNFG6Zgq8fNlafJBmgkjSQ52ULwi14NKXJ9UnqyChWJXS5j5hJn+X+/FXRDQ==\n" +
    "4AYmM8sgffM1HBEEutcuJ8HCDtXvPKQcrLEK9Gv4W3sg:5BaaEQWasHhSc4rkBXbKgcs382fUstLZhkBH3MFK5hk1:514914:8ej98gR+7/nB0M75CyZsKjybAVkRaOzPXch3cqNVzfFrgSdFfXePE1kPVaTqolbfOiiK7FodC58ofnr9lglJDw==\n" +
    "Bi1a2bKPAmBkjpHMuEzffVPZJfnesg34cUfTbDHegywV:Ev9T1sE8MjWuo7SQjKW7NFYPW5VSUxGpJ4TQgz4dDCqL:514913:Y9uw3E4KTHrVHuAX1jdGIzkh9RRBmLdC4H4GngvLzGYayi1Bx+2kIoDhV1f5htWcW0cXiOGqdWZgWbrY67bLCg==\n" +
    "4km3ARYpr7yE5PriXCxdRxGU6Yq3gH27pJcPU1bgQAjh:DvPrYHvsa3QKRXpB3ULNvqGK8d2hJ9HfL9B7FCKvRhs7:514913:jW5kTPquOSsWljDw/8m0wc8UFJs+4C/9oT0rVqoi2ZLuAWl6zg7Xo/YliduayP3F9f1wyxWkk5eTfwzP7x+FDg==\n" +
    "C4D3ykicaK5YDs9yTGEURnihCRfVxa36BAhRe2MEG8yq:3qyesTqvjAXQ98eCaQLutgXws3vXD6giydWkuSMTi1Yi:514913:jblf0aZIwhXcCo3VYkzrUMCy1dIjl7daVaF5S25iAa3BuBKL4Bx+Fbo4ZxwClcBQkHzJ2hgZ7ReuWy4laRZeCQ==\n" +
    "DL5nXSfw4jH9JQTSR6fEk9e69o1SiUk9cH36M6SpjVV9:BaCxMx4z1RGZ7a2Gv4voXJDhXHtdJuww9odEtZDZWycs:514179:uuAij33nan65ojtOZXYO8N07+qz4RKna843NepgU5JtZZCdOXNK2mMy5485y49CvHOQYhmYfl2SG7MCRzC4DCg==\n" +
    "AHzVdBhft28MBcXz5UDNgK8NNdyQtBV35w8GuEkAGepy:Fr9XTH26kFBeRFPbbdoo5qFJikb54Y13BBiY4fErCpxi:513518:ab8FnsRxI2BR5dkjZr9+SKpOhYywB7tcn2f2uSCxv6N+dUK23PbLaCRgrq340ivHZNMcIPsRyqI9F52ohIMtDQ==\n" +
    "BJXnups88wJNwUZowjmikRMPFQLxN2gm3jh9VzXcSnoy:9dMgMY8d1PQRTvjCVjhYxNbvM6tfUfd2SwphqSsJZLUT:513517:y7o691aNOew4sm7ztQ1IkFV8cQZUOf263yKAMVaBPYloK3O5WEM8D+folFYbSXpQoZdSAlRviRlNanBHW35FAw==\n" +
    "Transactions:\n" +
    "TX:10:1:5:5:2:1:0\n" +
    "514918-000000342C2240AB86C669326D723A0B8421840FF909076F5739F7FD59B31709\n" +
    "HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94\n" +
    "1042:0:D:HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94:503508\n" +
    "1042:0:D:HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94:503799\n" +
    "1042:0:D:HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94:504076\n" +
    "1042:0:D:HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94:504350\n" +
    "1042:0:D:HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94:504615\n" +
    "0:SIG(0)\n" +
    "1:SIG(0)\n" +
    "2:SIG(0)\n" +
    "3:SIG(0)\n" +
    "4:SIG(0)\n" +
    "5000:0:SIG(DvB8gAiL78cXZPHKfza2TR9xCxiCJiAbpzoCSkVhSd9e)\n" +
    "210:0:SIG(HCV6HP1goDQjnwDXUGrDAaiJDiChtsL1RmVBBLxapq94)\n" +
    "PAF Certifications\n" +
    "OMmFGkqGp2BjchdiW2DOC5Wtc5G6NisY9aOL8lFX6f86ks0ptOun9/ec9sQJmtw7v/z37Iuug3gvax53tEXQAQ==\n" +
    "InnerHash: A997D800B6A2D1D2098EC48D73DAB87AADADCE2C29D930A010EC341DE4D44215\n" +
    "Nonce: 10200000000001\n" +
    "TFYwQL+WphWuZ4ue08WaEeKWsPmonEa0VpiIuCsvz9TcfHS4bZ4J15Upgj5gv9IUzFPrch4d6bEezPxit9ZyAw==\n";


describe("Block reserved keywords", () => {

  const parser = parsers.parseBlock;

  it('should be accepted', () => parser.syncWrite(raw))
});

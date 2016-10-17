# Developer guide

### Releases
To do releases, there is a script which handle it for us.
All services included GitHub will automatically create a release.

#### Pre-releases
```bash
./release.sh pre 0.40.0a4
```

#### Stable releases
```bash
./release.sh rel 0.40.0
```

Releases are based on tags. This script will tag the commit.

So, you will have to push tags to trigger releases:
```bash
git push --tags
```

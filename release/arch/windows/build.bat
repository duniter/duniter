
set DUNITER_BRANCH=1.3.x
set VER_UI=%DUNITER_BRANCH%
set VER_BMA=%DUNITER_BRANCH%
set VER_CRAWLER=%DUNITER_BRANCH%
set VER_KEYPAIR=%DUNITER_BRANCH%

set ADDON_VERSION=48
set NW_VERSION=0.17.6
set NODEJS_VERSION=6.11.0

set NW_RELEASE=v0.17.6
set NW=nwjs-%NW_RELEASE%-win-x64
set NW_GZ=%NW%.zip

set NODE_RELEASE=v%NODEJS_VERSION%
set NODE=node-v%NODEJS_VERSION%-win-x64
set NODE_ZIP=node-v%NODEJS_VERSION%-win-x64.zip
node -v

REM NPM
set PATH="C:\Users\vagrant\AppData\Roaming\npm";%PATH%
REM InnoSetup
set PATH="C:\Program Files (x86)\Inno Setup 5";%PATH%

cd C:\Users\vagrant

if not exist %NODE_ZIP% (
  echo "Telechargement de %NODE_ZIP%..."
  powershell -Command "(New-Object System.Net.WebClient).DownloadFile(\"https://nodejs.org/dist/%NODE_RELEASE%/%NODE_ZIP%\", \"%NODE_ZIP%\")"
  call 7z x %NODE_ZIP%
)

echo "Suppression des anciennes sources..."
rd /s /q duniter
rd /s /q duniter_release
rd /s /q %NW%
echo "Clonage de Duniter..."
git clone https://github.com/duniter/duniter.git
cd duniter

for /f "delims=" %%a in ('git rev-list --tags --max-count=1') do @set DUNITER_REV=%%a
for /f "delims=" %%a in ('git describe --tags %DUNITER_REV%') do @set DUNITER_TAG=%%a
echo %DUNITER_TAG%

git checkout %DUNITER_TAG%

call npm cache clean
call npm install --production
REM call npm test
echo "Retrait des modules 'dev'..."
call npm prune --production
echo "Ajout du module 1/4..."
call npm install duniter-bma@%VER_BMA% --save --production
echo "Ajout du module 2/4..."
call npm install duniter-crawler@%VER_CRAWLER% --save --production
echo "Ajout du module 3/4..."
call npm install duniter-keypair@%VER_KEYPAIR% --save --production
echo "Ajout du module 4/4..."
call npm install duniter-ui@%VER_UI% --save --production

REM echo ">> VM: installing peerDependencies installer..."
REM call npm i --save-dev @team-griffin/install-self-peers
REM echo ">> VM: installing peerDependencies..."
REM call ./node_modules/.bin/install-self-peers --npm -- --production

set SRC=%cd%
echo %SRC%
cd node_modules/wotb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\wotb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\wotb.node /Y
cd ../naclb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\naclb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\naclb.node /Y
cd ../scryptb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\scryptb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\scryptb.node /Y
cd ../sqlite3
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\node-webkit-%NW_RELEASE%-win32-x64\node_sqlite3.node %cd%\lib\binding\node-v%ADDON_VERSION%-win32-x64\node_sqlite3.node /Y
cd ../heapdump
call nw-gyp --target=%NW_VERSION% --msvs_version=2015 configure
call nw-gyp --target=%NW_VERSION% --msvs_version=2015 build
cd ../../..
mkdir duniter_release
mkdir duniter_release\nodejs
call 7z x %NW_GZ%
xcopy %NW%\* %cd%\duniter_release\ /s /e /Y
xcopy %SRC%\gui\* %cd%\duniter_release\ /s /e /Y
xcopy %SRC%\* %cd%\duniter_release\ /s /e /Y
xcopy %NODE%\* %cd%\duniter_release\nodejs\ /s /e /Y
cd duniter_release
powershell -Command "(Get-Content package.json) | foreach-object {$_ -replace '\"main\": \"index.js\",','\"main\": \"index.html\",' } | Set-Content package.json2"
move /y package.json2 package.json
cd ..
iscc C:\vagrant\duniter.iss /DROOT_PATH=%cd%\duniter_release
move %cd%\duniter_release\Duniter.exe C:\vagrant\duniter-desktop-%DUNITER_TAG%-windows-x64.exe
echo "Build done: binary available at duniter-desktop-%DUNITER_TAG%-windows-x64.exe"

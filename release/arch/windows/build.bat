
set ADDON_VERSION=59
set NW_VERSION=0.28.1
set NODEJS_VERSION=9.5.0

set NW_RELEASE=v%NW_VERSION%
set NW=nwjs-%NW_RELEASE%-win-x64
set NW_GZ=%NW%.zip

set NODE_RELEASE=v%NODEJS_VERSION%
set NODE=node-v%NODEJS_VERSION%-win-x64
set NODE_ZIP=node-v%NODEJS_VERSION%-win-x64.zip
set NODE_MSI=node-v%NODEJS_VERSION%-x64.msi

echo "Version courante de NodeJS : "
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

if not exist %NODE_MSI% (
  echo "Telechargement de %NODE_MSI%..."
  powershell -Command "(New-Object System.Net.WebClient).DownloadFile(\"https://nodejs.org/dist/%NODE_RELEASE%/%NODE_MSI%\", \"%NODE_MSI%\")"
  powershell -Command "Start-Process msiexec.exe -Wait -ArgumentList '/I %cd%\%NODE_MSI% /quiet'"
)

powershell -Command "Start-Process msiexec.exe -Wait -ArgumentList '/I %cd%\%NODE_MSI% /quiet'"

if not exist %NW_GZ% (
  echo "Telechargement de %NW_GZ%..."
  powershell -Command "(New-Object System.Net.WebClient).DownloadFile(\"https://dl.nwjs.io/%NW_RELEASE%/%NW_GZ%\", \"%NW_GZ%\")"
  call 7z x %NW_GZ%
)

echo "Version courante de NodeJS : "
node -v

call npm install -g node-pre-gyp
call npm install -g nw-gyp

echo "Suppression des anciennes sources..."
rd /s /q duniter
rd /s /q duniter_release
rd /s /q %NW%
echo "Clonage de Duniter..."
mkdir duniter
xcopy C:\vagrant\duniter-source\* %cd%\duniter\* /s /e /Y
cd duniter

for /f "delims=" %%x in (C:\vagrant\duniter_tag.txt) do set DUNITER_TAG=%%x
echo %DUNITER_TAG%

git checkout %DUNITER_TAG%

call npm cache clean
call npm install
echo "Patch de leveldown..."
move %cd%\node_modules\leveldown\package.json %cd%\node_modules\leveldown\package.json.back /s /e /Y
move %cd%\release\resources\leveldown-fix.json %cd%\node_modules\leveldown\package.json /s /e /Y
REM call npm test
echo "Ajout du module 1/1 (duniter-ui)..."
call npm install duniter-ui@1.7.x --save --production
echo "Retrait des modules 'dev'..."
call npm prune --production

REM echo ">> VM: installing peerDependencies installer..."
REM call npm i --save-dev @team-griffin/install-self-peers
REM echo ">> VM: installing peerDependencies..."
REM call ./node_modules/.bin/install-self-peers --npm -- --production

set SRC=%cd%
echo %SRC%
cd node_modules/wotb
call npm install --build-from-source

REM PREPARE common.gypi
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure

call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\wotb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\wotb.node /Y
cd ../naclb
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
copy %cd%\lib\binding\Release\node-webkit-%NW_RELEASE%-win32-x64\naclb.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\naclb.node /Y
cd ../leveldown
call npm install --build-from-source
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 configure
call node-pre-gyp --runtime=node-webkit --target=%NW_VERSION% --msvs_version=2015 build
mkdir %cd%\lib
mkdir %cd%\lib\binding
mkdir %cd%\lib\binding\Release
mkdir %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64
copy %cd%\build\Release\leveldown.node %cd%\lib\binding\Release\node-v%ADDON_VERSION%-win32-x64\leveldown.node /Y
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

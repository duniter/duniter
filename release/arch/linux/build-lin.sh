#!/bin/bash

if [[ -z "${1}" ]]; then
	echo "Fatal: no version given to build script"
	exit 1
fi
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
	source "$NVM_DIR/nvm.sh"
else
	echo "Fatal: could not load nvm"
	exit 1
fi

# ---------
# Functions
# ---------

# Copy nw.js compiled module released library to node libraries.
# -
# Parameters:
# 1. Module name.
nw_copy() {
	[[ -z ${1} ]] && exit 1
	cp lib/binding/Release/node-webkit-v${NW_VERSION}-linux-x64/${1}.node \
		lib/binding/Release/node-v${ADDON_VERSION}-linux-x64/${1}.node || exit 1
}

# Copy nw.js compiled module library to node libraries, prefixing with node_.
# -
# Parameters:
# 1. Module name.
nw_copy_node() {
	[[ -z ${1} ]] && exit 1
	cp lib/binding/node-webkit-v${NW_VERSION}-linux-x64/node_${1}.node \
		lib/binding/node-v${ADDON_VERSION}-linux-x64/node_${1}.node || exit 1
}

# Compile the module with nw.js.
# -
# Parameters:
# 1. Module name.
# 2. Action to be done to module after compilation, if needed.
nw_compile() {
	[[ -z ${1} ]] && exit 1
	cd ${1} || exit 1
	node-pre-gyp --runtime=node-webkit --target=${NW_VERSION} configure || exit 1
	node-pre-gyp --runtime=node-webkit --target=${NW_VERSION} build || exit 1
	[[ -z ${2} ]] || ${2} ${1}
	cd ..
}

# Create description.
# -
# Parameters:
# 1. Initial file name.
# 2. Building type (either “desktop” or “server”).
# 3. Category (OS, distribution).
create_desc() {
	cat >"${1}".desc <<-EOF
	{
	  "version": "${DUNITER_TAG}",
	  "job": "${CI_JOB_NAME}",
	  "type": "${2^}",
	  "category": "${3}",
	  "arch": "x64"
	}
	EOF
}

# Desktop specific building phase.
# -
# Parameters:
# 1. Building directory.
build_extra_desktop() {
	cp -r "${ROOT}/release/extra/desktop/"* "${1}" || exit 1
}

# Server specific building phase.
# -
# Parameters:
# 1. Building directory.
build_extra_server() {
	mkdir -p "${1}/lib/systemd/system" || exit 1
	cp "${ROOT}/release/extra/systemd/duniter.service" "${1}/lib/systemd/system" || exit 1
}

# Debian package building.
# -
# Parameters:
# 1. Building type (either “desktop” or “server”).
# 2. Debian package name.
build_deb_pack() {
	rm -rf "${RELEASES}/duniter-x64"
	mkdir "${RELEASES}/duniter-x64" || exit 1
	cp -r "${ROOT}/release/extra/debian/package/"* "${RELEASES}/duniter-x64" || exit 1
	build_extra_${1} "${RELEASES}/duniter-x64"
	mkdir -p "${RELEASES}/duniter-x64/opt/duniter/" || exit 1
	chmod 755 "${RELEASES}/duniter-x64/DEBIAN/"post* || exit 1
	chmod 755 "${RELEASES}/duniter-x64/DEBIAN/"pre* || exit 1
	sed -i "s/Version:.*/Version:${DUNITER_DEB_VER}/g" "${RELEASES}/duniter-x64/DEBIAN/control" || exit 1

	cd "${RELEASES}/${1}_/"
	zip -qr "${RELEASES}/duniter-x64/opt/duniter/duniter.zip" * || exit 1

	sed -i "s/Package: .*/Package: ${2}/g" "${RELEASES}/duniter-x64/DEBIAN/control" || exit 1

	cd "${RELEASES}"
	fakeroot dpkg-deb --build duniter-x64 || exit 1
	mv duniter-x64.deb "${BIN}/duniter-${1}-${DUNITER_TAG}-linux-x64.deb" || exit 1
	create_desc "${BIN}/duniter-${1}-${DUNITER_TAG}-linux-x64.deb" "${1}" "Linux (Ubuntu/Debian)"
}

# -----------
# Prepare
# -----------

NODE_VERSION=8.9.1
NVER="v${NODE_VERSION}"
DUNITER_TAG="v${1}"
DUNITER_DEB_VER=" ${1}"
ADDON_VERSION=57
NW_VERSION=0.24.4
NW_RELEASE="v${NW_VERSION}"
NW="nwjs-${NW_RELEASE}-linux-x64"
NW_GZ="${NW}.tar.gz"
DUNITER_UI_VER="1.6.x"

nvm install ${NVER} || exit 1
nvm use ${NVER} || exit 1
npm install -g node-pre-gyp || exit 1
npm install -g nw-gyp || exit 1

# -----------
# Folders
# -----------

ROOT="${PWD}"
WORK_NAME=work
WORK="${ROOT}/${WORK_NAME}"
DOWNLOADS="${WORK}/downloads"
RELEASES="${WORK}/releases"
BIN="${WORK}/bin"

mkdir -p "${DOWNLOADS}" "${RELEASES}" "${BIN}" || exit 1
rm -rf "${BIN}/"*.{deb,tar.gz}{,.desc} # Clean up

# -----------
# Downloads
# -----------

cd "${DOWNLOADS}"
curl -O https://dl.nwjs.io/${NW_RELEASE}/${NW_GZ} || exit 1
tar xzf ${NW_GZ} || exit 1
rm ${NW_GZ}
curl -O http://nodejs.org/dist/${NVER}/node-${NVER}-linux-x64.tar.gz || exit 1
tar xzf node-${NVER}-linux-x64.tar.gz || exit 1
rm node-${NVER}-linux-x64.tar.gz

# -----------
# Releases
# -----------

# Prepare sources
mkdir -p "${RELEASES}/duniter" || exit 1
cp -r $(find "${ROOT}" -mindepth 1 -maxdepth 1 ! -name "${WORK_NAME}") "${RELEASES}/duniter" || exit 1
cd "${RELEASES}/duniter"
rm -Rf .gitignore .git || exit 1 # Remove git files

# Build
echo ">> VM: building modules..."
npm install || exit 1

# Duniter UI
npm install "duniter-ui@${DUNITER_UI_VER}" || exit 1
npm prune --production || exit 1

rm -rf release coverage test # Non production folders
cp -r "${RELEASES}/duniter" "${RELEASES}/desktop_" || exit 1
cp -r "${RELEASES}/duniter" "${RELEASES}/server_" || exit 1

# -------------------------------------
# Build Desktop version against nw.js
# -------------------------------------

echo "${NW_RELEASE}"

# FIX: bug of nw.js, we need to patch first.
# TODO: remove this patch once a correct version of Nw.js is out (NodeJS 8 or 9 if the above modules are compliant)
cd "${RELEASES}/desktop_/node_modules/wotb"
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure \
  || echo "This failure is expected"
cp ${ROOT}/release/arch/linux/0.24.4_common.gypi ~/.nw-gyp/0.24.4/common.gypi || exit 1

cd "${RELEASES}/desktop_/node_modules/"
nw_compile wotb nw_copy
nw_compile naclb nw_copy
nw_compile scryptb nw_copy
nw_compile sqlite3 nw_copy_node

# Unused binaries
cd "${RELEASES}/desktop_/"
rm -rf node_modules/sqlite3/build

# --------------------------------
# Embed nw.js in desktop version
# --------------------------------

# Install Nw.js
mkdir -p "${RELEASES}/desktop_release" || exit 1
cp -r "${DOWNLOADS}/${NW}/"* "${RELEASES}/desktop_release/" || exit 1
# Embed Node.js with Nw.js to make Duniter modules installable
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/lib" "${RELEASES}/desktop_release/" || exit 1
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/include" "${RELEASES}/desktop_release/" || exit 1
cp -r "${DOWNLOADS}/node-${NVER}-linux-x64/bin" "${RELEASES}/desktop_release/" || exit 1
# Add some specific files for GUI
cp "${RELEASES}/desktop_/gui/"* "${RELEASES}/desktop_release/" || exit 1
# Add Duniter sources
cp -R "${RELEASES}/desktop_/"* "${RELEASES}/desktop_release/" || exit 1
# Insert Nw specific fields while they do not exist (1.3.3)
sed -i "s/\"main\": \"index.js\",/\"main\": \"index.html\",/" "${RELEASES}/desktop_release/package.json" || exit 1
# Add links for Node.js + NPM
cd "${RELEASES}/desktop_release/bin"
ln -s "../lib/node_modules/npm/bin/npm-cli.js" "./npm" -f || exit 1
cd ..
ln -s "./bin/node" "node" -f || exit 1
ln -s "./bin/npm" "npm" -f || exit 1
#sed -i "s/\"node-main\": \"\.\.\/sources\/bin\/duniter\",/\"node-main\": \".\/bin\/duniter\",/" "$RELEASES/desktop_release/package.json"
rm -rf "${RELEASES}/desktop_"
mv "${RELEASES}/desktop_release" "${RELEASES}/desktop_"

# ---------------------------------
# Embed node.js in server version
# ---------------------------------

cp -r "${DOWNLOADS}/node-${NVER}-linux-x64" "${RELEASES}/server_/node" || exit 1

# ---------------
# Build .tar.gz
# ---------------

cd "${RELEASES}/desktop_"
tar czf "${BIN}/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz" * || exit 1
create_desc "${BIN}/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz" "Desktop" "Linux (generic)"

# -----------------------
# Build Debian packages
# -----------------------

build_deb_pack desktop duniter-desktop
build_deb_pack server duniter

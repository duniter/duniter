# If “make” is called from a directory controlled by git (the main directory), it will create a directory
# named “work” with a sub-directory taken from the “DEST” property, if provided. It will then clone itself
# there, and the command will be executed from the clone.
# If “make” is not called from a directory controlled by git, it will be executed in place.
#
# Requires the following dependencies:
#  * Python 2.7 (build only)
#  * NodeJS >=10.x (build and runtime)
#  * npm (build only)
#  * Rust (build only)
#
# Following parameters may be provided:
#  * ARCH: The target architecture (default: autodetect).
#  * PLATFORM: The target platform (default: autodetect).
#  * ADD_DEBUG: Set to Y to add debug information in result (default: Y).
#  * DEST: The destination sub-folder (default: empty).
#
# Main targets are:
#  * desktop (default): Build a full desktop application.
#  * server-gui: Build a server with GUI.
#  * server: Build a server without GUI.
#  * base-gui: Prepare any application requiring GUI.
#  * base: Prepare any application.
#  * wipe: Remove files which should not be delivered.
#  * clean (only in main directory): remove the Makefile from target directory.
#  * mrproper (only in main directory): remove the target directory.

# This will depend on the current version
NW_VERSION = 0.33.1
ADDON_VERSION = 64
DUNITER_UI_VERSION = 1.7.x
DEV_FILES = $(wildcard .eslint* .git* .npm* .prettierignore Cargo.* deny.toml gui license-header.txt npm* \
	tsconfig* tslint* yarn*)

# This may be overriden by caller
ARCH = $(shell uname -m | sed -e "s/86_//")
PLATFORM = $(shell uname -s | tr A-Z a-z)
ADD_DEBUG = Y
DEST =

# Keep all intermediate targets
.SECONDARY:

######
# We are on project copy
######
ifneq ($(wildcard package.json),)
unexport MAKEFLAGS
unexport ARCH
unexport PLATFORM
unexport ADD_DEBUG
unexport DEST

export npm_config_unsafe_perm = true

simplename = $(patsubst node_%,%,$(basename $(notdir $(1))))
nodedep = node_modules/$(1)/package.json
leveldown.COMPILED = leveldown/lib/binding/Release/node-v$(ADDON_VERSION)-$(PLATFORM)-$(ARCH)/leveldown.node
leveldown.PREPARE = cp release/resources/leveldown-fix.json node_modules/leveldown/package.json
leveldown.INTERMEDIATE = build/Release
sqlite3.COMPILED = sqlite3/lib/binding/node-v$(ADDON_VERSION)-$(PLATFORM)-$(ARCH)/node_sqlite3.node
sqlite3.INTERMEDIATE = lib/binding/node-webkit-v${NW_VERSION}-$(PLATFORM)-$(ARCH)
nw.VERSION = @$(NW_VERSION)
duniter-ui.VERSION = @$(DUNITER_UI_VERSION)

# Build the desktop
.PHONY: desktop
desktop: index.html
	$(MAKE) ADD_DEBUG=$(ADD_DEBUG) wipe

# Build the server with GUI
.PHONY: server-gui
server-gui: base-gui
	$(MAKE) ADD_DEBUG=$(ADD_DEBUG) wipe

# Build the server
.PHONY: server
server: base
	$(MAKE) ADD_DEBUG=$(ADD_DEBUG) wipe

# Build the base with GUI
.PHONY: base-gui
base-gui: $(call nodedep,duniter-ui) base

# Build the base
.PHONY: base
base: | node_modules

index.html: $(call nodedep,duniter-ui) $(addprefix node_modules/,$(leveldown.COMPILED) $(sqlite3.COMPILED))
	@sed -i "s/\"main\": \"index.js\",/\"main\": \"index.html\",/" package.json
	@mv gui/* .

node_modules/%.node: $(call nodedep,nw-gyp) $(call nodedep,nw)
	@$(if $($(call simplename,$@).PREPARE),$($(call simplename,$@).PREPARE))
	@PATH=$(shell npm bin):${PATH} node-pre-gyp \
		-C node_modules/$(call simplename,$@) \
		--runtime=node-webkit \
		--target=$(NW_VERSION) \
		--target_arch=$(ARCH) \
		--target_platform=$(PLATFORM) \
		configure build
	@mkdir -p "$(dir $@)"
	@cp "node_modules/$(call simplename,$@)/$($(call simplename,$@).INTERMEDIATE)/$(notdir $@)" "$@"

node_modules/%/package.json: | node_modules
	@NEON_BUILD_RELEASE="true" npm add $*$($*.VERSION)

node_modules:
	@npm uninstall husky
	@NEON_BUILD_RELEASE="true" npm install

# Wipe the delivery result
.PHONY: wipe
wipe:
	@npm uninstall nw-gyp
	@PATH=$(shell npm bin):${PATH} npm prune --production
	@find -name "*.ts" ! -name "*.d.ts" -delete
ifneq ($(ADD_DEBUG),Y)
	@find -name "*.d.ts" -delete -o -name "*.js.map" -delete
endif
	@rm -rf $(DEV_FILES)
	@mv release/extra .
	@rm -rf coverage coverage.* release test
	@rm -rf target
	@rm -rf neon/native/target
	@rm -rf node_modules/sqlite3/build
	@rm -rf node_modules/duniter-ui/node_modules

######
# We are on main project
######
else ifneq ($(wildcard ../package.json),)
WORK = ../work
TARGET_DIR = $(abspath $(WORK)/$(DEST)/)
MAIN_ACTIONS = desktop server-gui server base-gui base wipe

.PHONY: $(MAIN_ACTIONS)
$(MAIN_ACTIONS): $(TARGET_DIR)/Makefile
	@$(MAKE) -C $(TARGET_DIR) $@

$(TARGET_DIR)/Makefile: | $(TARGET_DIR)
	@find .. -mindepth 1 -maxdepth 1 ! -name work ! -name .git -print0 |\
		xargs -0 -I{} cp -r {} "$(TARGET_DIR)" || exit 1
	@cp Makefile "$(TARGET_DIR)"

$(TARGET_DIR):
	@mkdir -p "$(TARGET_DIR)"

.PHONY: clean
clean:
	@rm "$(TARGET_DIR)/Makefile"

.PHONY: mrproper
mrproper:
	@rm -rf "$(TARGET_DIR)"

######
# We are… lost?
######
else
%:
	$(error Cannot figure where I am)

######
# Main project or copy
######
endif

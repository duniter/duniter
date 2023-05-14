#!/usr/bin/make -f

define newline


endef

define echomultiline
	/usr/bin/echo -e '$(subst $(newline),\n,$1)'
endef

define HEADER
# Do not edit this file. It is generated from this command:
# ./dockerignore.make

endef

define DOCKERIGNORE
.cargo
.git*
doc
dockerignore.make
gui
test
endef

define GITIGNORE_HEADER

# ------------------
# .gitignore content
# ------------------

endef

all: .dockerignore

.PHONY: .dockerignore

.dockerignore: .gitignore
	$(call echomultiline,$(HEADER)) >$@.tmp
	$(call echomultiline,$(DOCKERIGNORE)) >>$@.tmp
	$(call echomultiline,$(GITIGNORE_HEADER)) >>$@.tmp
	cat .gitignore >>$@.tmp
	mv $@.tmp $@

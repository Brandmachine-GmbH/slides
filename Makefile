# Developing @brandmachine/slides itself. A site that USES the package runs `npx slides ...`
# instead and needs none of this.
#
# This repo is the package, and template/ is the site it develops against: the same files
# `slides init` writes into a new site, so the example that ships is the example that is tested.
#
#   make dev [deck]      one deck of template/ at localhost:5173, with hot reload
#   make build           build template/ (every check the package runs for a site)
#   make serve           build, then serve template/ at localhost:8888, /admin included
#   make pdf [deck]      a vector PDF of a template/ deck
#   make motion [deck]   measure every transition in a deck
#   make check           pack the package and use it from an empty folder, as a stranger would
#   make fonts           regenerate the static export fonts (needs uv)

.PHONY: help install dev build serve pdf motion check fonts

SLIDES = cd template && node ../bin/slides.mjs
DECK = $(filter-out $@,$(MAKECMDGOALS))

help:
	@sed -n '1,/^$$/p' Makefile | sed 's/^# \{0,1\}//'

node_modules: package.json
	npm install
	@touch node_modules

install: node_modules

dev: node_modules
	@$(SLIDES) dev $(DECK)

build: node_modules
	@$(SLIDES) build

serve: node_modules
	@$(SLIDES) serve --build

pdf: node_modules
	@$(SLIDES) pdf $(DECK)

motion: node_modules
	@$(SLIDES) motion $(DECK)

check: node_modules
	@npm run -s check

fonts:
	uv run scripts/make-static-fonts.py

# Swallow the bare deck-name goal so `make dev example` does not also try to make "example".
%:
	@:

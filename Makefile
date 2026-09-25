# Deck site: common tasks.
#
#   make serve                   the WHOLE site at localhost:8888, /admin included
#   make motion example         measure every transition in a deck for jumps
#   make dev example          preview one deck at localhost:5173, with hot reload
#   make admin                   preview the /admin deck index (no password)
#   make admin-live              the same, with the real password gate
#   make pdf example   export a deck to a vector PDF (decks/<deck>/<deck>.pdf)
#   make build                   build every deck into dist/ (runs the leak check)
#   make fonts                   regenerate the static export fonts (uses uv)
#   make install                 install node dependencies
#   make export-public           copy the engine (and nothing else) to ../slides-engine
#
# The PDF export needs Node deps (auto-installed on first `make pdf`); `make fonts`
# needs uv (https://docs.astral.sh/uv/) and nothing else.

.PHONY: help serve motion dev admin admin-live build pdf fonts install export-public

help:
	@echo "make serve        the whole site at localhost:8888, /admin and the editor included"
	@echo "make motion <deck> walk every transition and measure it for jumps"
	@echo "make dev <deck>   preview one deck at localhost:5173, with hot reload"
	@echo "make admin        preview the /admin deck index in a browser (no password)"
	@echo "make admin-live   the same, served by netlify with the real password gate"
	@echo "make pdf <deck>   export a deck to a vector PDF (decks/<deck>/<deck>.pdf)"
	@echo "make build        build every deck into dist/ (runs the leak check)"
	@echo "make fonts        regenerate static export fonts from the variable woff2 (uv)"
	@echo "make install      install node dependencies"
	@echo "make export-public  copy the engine, and only the engine, to ../slides-engine"

install:
	npm install

# Auto-install node deps when missing or when package.json changed.
node_modules: package.json
	npm install
	@touch node_modules

# Deck name is passed as a bare word (make pdf example); DECK=... also works.
pdf: node_modules
	@deck="$(or $(DECK),$(filter-out $@,$(MAKECMDGOALS)))"; \
	test -n "$$deck" || { echo "usage: make pdf <deck>  (e.g. make pdf example)"; exit 1; }; \
	node scripts/export-pdf.mjs $$deck

# Everything, the way the deployed site is put together: each deck at its slug, the /admin index,
# and /admin/edit/<deck>. Builds first, because it serves dist/.
#
# This is the one to reach for when you want to click around. It needs nothing installed beyond
# this repo, unlike admin-live, which runs the genuine edge function and wants the Netlify CLI.
# It has NO hot reload and NO password: see the header of scripts/serve.mjs.
serve: build
	@node scripts/serve.mjs

# Walks every transition in a deck and reports anything that jumps, snaps, or animates while a
# slide change is still running. Reports; never fails. See the header of scripts/motion.mjs for
# what the three numbers mean and why a deliberate overshoot looks the same as a bug from here.
motion: build
	@deck="$(or $(DECK),$(filter-out $@,$(MAKECMDGOALS)))"; \
	test -n "$$deck" || { echo "usage: make motion <deck>  (e.g. make motion example)"; exit 1; }; \
	node scripts/motion.mjs $$deck

dev: node_modules
	@deck="$(or $(DECK),$(filter-out $@,$(MAKECMDGOALS)))"; \
	test -n "$$deck" || { echo "usage: make dev <deck>  (e.g. make dev example)"; exit 1; }; \
	test -d "decks/$$deck" || { echo "no such deck: decks/$$deck"; exit 1; }; \
	VITE_DECK=$$deck npm run dev

build: node_modules
	npm run build

# The /admin index is a Netlify edge function and its HTML is compiled into
# netlify/edge-functions/lib/hub.js at build time, so `npm run dev` never shows it. This
# pulls that HTML straight out and opens it: real page, real data, no password, no server.
# Enough for checking a layout change or a new internal note.
admin: build
	@node -e 'import("./netlify/edge-functions/lib/hub.js").then(m=>require("fs").writeFileSync("/tmp/deck-admin.html",m.HUB_HTML))'
	@echo "opening /tmp/deck-admin.html"
	@open /tmp/deck-admin.html

# The same page served the way it is in production, so the password gate is exercised too.
#
# --offline matters: without it the CLI phones home for the linked site's addons and env, and
# fails with "Failed retrieving addons for site ... Not Found" whenever this checkout's
# .netlify/state.json points at a site the logged-in account cannot see. Nothing here needs
# the network, so skip it. The two env vars are required because the function fails closed.
admin-live: build
	@command -v netlify >/dev/null || { echo "netlify CLI not found:  brew install netlify-cli"; exit 1; }
	@echo
	@echo "  http://localhost:8888/admin     passcode: test"
	@echo
	ADMIN_PASSWORD=test AUTH_SECRET=local-only-not-a-real-secret netlify dev --offline --dir dist

fonts:
	uv run scripts/make-static-fonts.py

# Swallow the bare deck-name goal so make doesn't error on it.
%:
	@:

# Publish the engine to the public repo.
#
# Stages to a temp directory and runs the public check over THAT first, so a failed check never
# writes a client's name into a public working tree. Commits nothing: it leaves a diff to read.
#
#   make export-public                 -> ../slides-engine
#   make export-public DEST=/some/dir
export-public:
	@test -f scripts/export-public.mjs || { echo "export-public only exists in the private repo this engine is exported from."; exit 1; }
	@node scripts/export-public.mjs $(DEST)

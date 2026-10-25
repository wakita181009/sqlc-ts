//go:build tools

// Records which sqlc release sqlc-ts bundles: scripts/sqlc-platforms.ts reads the version
// from go.mod, and Dependabot bumps it. Nothing here is built; the binaries come from
// sqlc's GitHub release.
package tools

import _ "github.com/sqlc-dev/sqlc/cmd/sqlc"

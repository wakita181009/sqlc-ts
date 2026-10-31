# Changelog

## [0.5.0](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.4.1...sqlc-ts-v0.5.0) (2026-10-31)


### Features

* let generate and check read the targets from sqlc's config ([#18](https://github.com/wakita181009/sqlc-ts/issues/18)) ([1ed8edd](https://github.com/wakita181009/sqlc-ts/commit/1ed8edd6c678c2386a7d3af25febbede6d9b36c7))

## [0.4.1](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.4.0...sqlc-ts-v0.4.1) (2026-10-31)


### Bug Fixes

* copy only .ts adapters and stop compiling the copied runtime files ([#15](https://github.com/wakita181009/sqlc-ts/issues/15)) ([03ee0b1](https://github.com/wakita181009/sqlc-ts/commit/03ee0b13efb478eb831d5173d9546530fdf78f4e))

## [0.4.0](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.3.0...sqlc-ts-v0.4.0) (2026-10-30)


### Features

* add pg, Neon, PGlite and Cloudflare D1 adapters ([#13](https://github.com/wakita181009/sqlc-ts/issues/13)) ([3cc3d9f](https://github.com/wakita181009/sqlc-ts/commit/3cc3d9fe9b13934ef5d90fe2298a37ab730a3a32))
* support sqlc.embed() with nested row types ([#11](https://github.com/wakita181009/sqlc-ts/issues/11)) ([a828b5c](https://github.com/wakita181009/sqlc-ts/commit/a828b5c4ce948692b127449585cd55ab23422919))
* write one driver adapter per file under adapters/ ([#14](https://github.com/wakita181009/sqlc-ts/issues/14)) ([879d0ac](https://github.com/wakita181009/sqlc-ts/commit/879d0acdc133946dee6f33259f18c13e178e482c))

## [0.3.0](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.2.0...sqlc-ts-v0.3.0) (2026-10-30)


### Features

* add a mysql dialect with mysql2 runtime and :execlastid ([#9](https://github.com/wakita181009/sqlc-ts/issues/9)) ([5073dd6](https://github.com/wakita181009/sqlc-ts/commit/5073dd6a5f86d9e11098a5941b5ced0093f56e5d))

## [0.2.0](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.1.0...sqlc-ts-v0.2.0) (2026-10-28)


### Features

* add a check command that verifies generated code is up to date ([#6](https://github.com/wakita181009/sqlc-ts/issues/6)) ([b0a64ee](https://github.com/wakita181009/sqlc-ts/commit/b0a64eeb4f99302b03659b91f6089bc866e2755b))

## [0.1.0](https://github.com/wakita181009/sqlc-ts/compare/sqlc-ts-v0.0.3...sqlc-ts-v0.1.0) (2026-10-25)


### Features

* add --help and --version ([97bfcd1](https://github.com/wakita181009/sqlc-ts/commit/97bfcd17051cc87adbb2054906c3d6ea240902db))
* move sqlc-ts out of the eroreel monorepo ([0c6e039](https://github.com/wakita181009/sqlc-ts/commit/0c6e039ced31453795ef4953ac4ec8f3e6a96789))
* support sqlite alongside postgres ([7aca9d8](https://github.com/wakita181009/sqlc-ts/commit/7aca9d804392c76120ecf645380a99023c6248af))


### Bug Fixes

* drop the Windows platform packages and release with release-please ([#4](https://github.com/wakita181009/sqlc-ts/issues/4)) ([1e94569](https://github.com/wakita181009/sqlc-ts/commit/1e945693bea0c7dfb386c44aaec6114bbb14196d))
* make generated code compile under noUncheckedIndexedAccess ([394188e](https://github.com/wakita181009/sqlc-ts/commit/394188ea4073054110fbaa8fc0103598ce6250c0))
* reject query names that camelCase to a JS reserved word ([#1](https://github.com/wakita181009/sqlc-ts/issues/1)) ([f455f0d](https://github.com/wakita181009/sqlc-ts/commit/f455f0df48a31fbf77ed9ac115d5bfece423a358))

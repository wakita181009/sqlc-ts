// The sqlc release bundled into the sqlc-ts-<platform>-<arch> packages. sqlc publishes no
// checksums, so these were taken from the downloaded release assets; fetching fails if an
// asset no longer matches. Keep SQLC_VERSION in step with mise.toml.
export const SQLC_VERSION = "1.31.1";

export const SQLC_PLATFORMS = [
  {
    platform: "darwin",
    arch: "arm64",
    asset: "darwin_arm64.tar.gz",
    sha256: "21602158c99eb1f2bae197a66abfb1941d1e9e50b23125bb193349c6b1acc71e",
  },
  {
    platform: "darwin",
    arch: "x64",
    asset: "darwin_amd64.tar.gz",
    sha256: "c5af76772e3785d21663a62697056b383f07629979b1bd25b93872e73dbd519b",
  },
  {
    platform: "linux",
    arch: "arm64",
    asset: "linux_arm64.tar.gz",
    sha256: "b7cae247740d0c51a1e657479e5b2d21e6fef428f596682a01bc55bf4ab8a23d",
  },
  {
    platform: "linux",
    arch: "x64",
    asset: "linux_amd64.tar.gz",
    sha256: "497ae4fcdfa64c5b0c311ffe4c2bd991e43991e82e5367792ed78bc2dca27354",
  },
  {
    platform: "win32",
    arch: "arm64",
    asset: "windows_arm64.zip",
    sha256: "b3d7a016c177923cb426f0d544d3ffbe2ff97306137bb77f668af709b5613692",
  },
  {
    platform: "win32",
    arch: "x64",
    asset: "windows_amd64.zip",
    sha256: "352711fa7dcb05dcdfefca0ad71b2c9a74fd090f8d7fc609419de4cbc725429f",
  },
] as const;

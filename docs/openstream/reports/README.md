# OpenStream benchmark reports

Each file here is a reproducible run of the [OpenStream](../../openstream.md) benchmark: proof, on real hardware with recorded versions, that the envelope restores every byte, that an incompressible input costs only the framing overhead, that a compressible one saves what it claims against the complete wire size, and how long each codec takes. The site renders them at `/docs/openstream/reports`.

A report is two files sharing one id:

- `<id>.json` — the machine-readable report (canonical). Its `schema` field is the version of the shape below.
- `<id>.md` — the same run rendered for reading, shown on the site.

The id is `YYYY-MM-DD-<implementation>-<version>[-<corpus>]`, for example `2026-09-12-nixamp-0.17.1-synthetic`. Append the corpus label when the run used the built-in synthetic corpus rather than authorized real samples, so no one mistakes a padded-fixture number for a production one.

## Publishing one

The reference implementation emits both files:

```
nixamp compression benchmark --out .
```

writes `openstream-report.json` and `openstream-report.md`. Rename them to the id, drop them in this directory, and open a pull request. The command exits non-zero if any codec that applied failed to restore byte-for-byte, so a report that would not build is caught before it is committed.

**A report is published with every release** of a reference implementation. The release step runs the benchmark, commits the two files here, and the site picks them up on its next deploy. Prefer a run over authorized real samples (`--corpus DIR`); a synthetic run is acceptable as a floor but is labelled as such and is not evidence of production savings.

## What the numbers mean, and do not

OpenStream is a framing envelope over Zstandard and gzip, not a new compression algorithm. A report measures those codecs at the block boundary, framed honestly. Read the `caveats` array in every report: a synthetic padded transport stream saves about its padding share and says more about the padding than the codec; an efficient real feed saves little; timings are for the one machine named in `environment`. The one number that is a pass/fail rather than a measurement is round-trip exactness, and it must hold for every applicable codec on every sample.

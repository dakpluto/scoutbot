# Web portal assets

Drop these files in here (exact filenames matter — the portal references
them directly, no build step involved):

| File | Size | Format | Notes |
| --- | --- | --- | --- |
| `favicon.ico` | 32×32 (multi-res .ico ideally has 16/32/48 baked in) | .ico | Browser tab icon. |
| `apple-touch-icon.png` | 180×180 | PNG, square, no transparency (iOS ignores alpha and shows black) | Home-screen icon on iOS. |
| `logo.png` | ~200px tall, width whatever keeps it proportional | PNG, transparent background | Header wordmark/emblem, shown at 70px tall — source larger (2–3x) so it stays sharp. Needs to read clearly on a navy-blue background, so light/white or full-color-with-white-outline versions work better than all-dark artwork. |
| `banner.png` | 1600×400 (4:1) | PNG or JPG | Optional wide banner — not wired into any page yet, reserved for a future homepage/landing hero if we want one. |

Nothing here is committed to git except this README (see `.gitignore`) —
each pack fork supplies its own branding.

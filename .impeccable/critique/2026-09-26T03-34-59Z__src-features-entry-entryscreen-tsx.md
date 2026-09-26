---
target: Nhập điểm (EntryScreen)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\ASUS-PRO\\Documents\\app_edu\\src\\features\\entry\\EntryScreen.tsx"
target_fingerprint: "sha256:db9e5117820475291c1c81f8210e3fa66ad35ba2804c3b63a966637e2ca080d5"
target_path: "C:\\Users\\ASUS-PRO\\Documents\\app_edu\\src\\features\\entry\\EntryScreen.tsx"
timestamp: 2026-09-26T03-34-59Z
slug: src-features-entry-entryscreen-tsx
---
# Critique: EntryScreen (Nhập điểm)

Method: dual-agent (A design review, B detector). Score 22/40 (Acceptable).

Heuristics: 1=3, 2=3, 3=2, 4=2, 5=3, 6=2, 7=2, 8=1, 9=2, 10=2.
Design specificity: category-interchangeable visually; functionally thoughtful (peer missing-comp detection, Buoi/Ngay lock, persisted view).
Detector: 0 findings on EntryScreen, CompEditor, Pick, Btn, Card. Browser visualization skipped (login + backend required).

## Priority issues
- [P0] Tap targets ~26-28px and tightly packed on phones (Pick, preset buttons, student pills). Fix: min 44px, 8px gaps, 4 presets + "Khac". Command: adapt.
- [P1] Toolbar overload (7 controls, duplicate progress readouts). Fix: keep Buoi + student + save state, move rest to "More" menu. Command: distill.
- [P1] Confirm modal on every student switch (~10 extra taps per class per day). Fix: auto-save with Undo snackbar. Command: clarify.
- [P1] "Da luu" toast fires before syncScore resolves. Fix: per-student pill state (saved/saving/failed), toast only on confirmed success. Command: harden.
- [P2] Three competing score-entry paths + duplicate "So cau" row. Command: distill.
- [P2] Student name + total scroll away on long rubrics; needs sticky bar. Command: layout.

## Personas
Casey: small targets, toolbar pushes card below fold. Sam: color-only state, no focus-visible, title tooltips. Jordan: unexplained "So cau", "Mac dinh", "Chon nhom". Alex: no keyboard next/prev.

## Minor
Red/rose warning colors vs no-alarm principle; low contrast text on navy and light green on white; hardcoded hexes vs C constants; emoji rendering differs on Android.

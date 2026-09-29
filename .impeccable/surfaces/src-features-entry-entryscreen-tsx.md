---
version: 1
slug: "src-features-entry-entryscreen-tsx"
primary_target: "src/features/entry/EntryScreen.tsx"
related_targets: ["src/App.tsx"]
---

# Surface brief: app shell + Nhập điểm (score entry)

Mode: Operate. Scope: shared shell (header, nav, atoms, tokens) and EntryScreen. Flow, copy and behavior stay; only the visual world is replaced.

Audience/job: Vietnamese tutoring-center teachers scoring ~10 kids per session on a phone or laptop, one-handed, mid-class; admins reading the same shell.

## Direction contract

THESIS: A class is a deck of flashcards; each student is one card, flipping to the next card is scoring the next student. Refuses the white rounded card-on-slate SaaS arrangement and emoji-as-icons.

OWN-WORLD: Cool lilac-grey desk (#EEF1F8), square-cornered white cards (radius 6px) with a 1.5px ink-tinted edge and no soft shadow. Four saturated index tabs carry meaning: cobalt #2447D6, tomato #E8503A, sunflower #F5B700, grass #178A4C. Ink #14182B. Baloo 2 for names and numbers, Be Vietnam Pro for body. State is a mark: red rubber stamp when scored, a folded corner where you stopped. Drawn SVG icons, never emoji.

STORY: The teacher sees whose card is up, how many cards remain, and which criterion band still needs a mark, then taps and moves on.

FIRST VIEWPORT: Top bar with class and Buổi/Ngày. Below it a horizontal strip of small student cards (stamped when scored, folded corner on the current one). Then one large white card: student name in display type at top-left, total top-right, attendance row, then one band per criterion each headed by a coloured index tab. Deck edge strips under the card show cards remaining. Primary action "Học sinh tiếp theo" is a full-width cobalt button at the bottom.

FORM: Flashcard deck (assigned candidate 5 of 7, raised by cutting-bench state-as-mark and Japanese-density hairlines). Seed key 48fa8c87.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

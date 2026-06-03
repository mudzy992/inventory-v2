# Full Effect — pregled

Implementacija `.cursor/docs/full-effect.md` u fazama 13–18 (+ 18a–c).

## Part 1 + Part 2

- **Part 1:** `.cursor/plans/full_effect_implementation_0b11231d.plan.md` — segmenti A–F
- **Part 2:** `.cursor/plans/full_effect_part_2_330ea95c.plan.md` — 1:1 CHECKLIST, 18a–c
- **Izvršenje:** ovaj folder; **ne duplirati** checkboxe izvan `CHECKLIST.md`

## Odluke (fiksne)

- Geografija: samo `City` (§3 out of scope)
- Org: postojeći `OrgUnitType` + matrica parent→child
- Transferi: raw → printed? → uploaded → potpisan; server PDF; finalize = equipment update

## Dependency graf

```
A (13) → C (15) → E (17) → F (18a)
A → B (14) ─┬→ C
B → D (16) ─┘→ F (18b)
Sve → F (18c)
```

## Out of scope

- Municipality / Place
- OrgUnitKind
- Scheduled 01.12–31.12 auto activate/close (settings stub OK)
- Offline članovi komisije bez user računa (samo employee — backend 17)

## Matrica § → faza

| § | Faza |
|---|------|
| §1 Potpisnik | 13 |
| §2 locationCityId create | 13 |
| §3 Geografija | — |
| §4 Hijerarhija | 13 |
| §5 Evidentičar | 14 |
| §6 Transferi | 15 (+17 cross) |
| §7 Skladišta | 16 |
| §8–9 UI org/warehouse | 18b |
| §11 Popis/rashod | 17 |
| §11.12 UI | 18a–c |
| §12 Test | CHECKLIST test sekcija |

# Planovi — tematski katalog (`.cursor/plans/`)

Planovi su **historijski zapisi implementacijskih sesija** (Cursor plan mode).
Ne prepisuju se retroaktivno; važeći status je u
[../../docs/STATUS.md](../../docs/STATUS.md) i aktivnim CHECKLIST fajlovima.
Ovaj katalog ih slaže tematski. Oznake: ✅ implementirano · 🟡 kod gotov, QA
otvoren · 🗄 specifikacija/plan (implementacija se prati drugdje).

## A. Krovni programi

| Plan | Tema | Status |
|------|------|--------|
| `inventory-v2/` (00–12 + CHECKLIST + HANDOFF) | Faze 0–12: foundation → popis | ✅ (QA rep u BACKLOG-u) |
| `full-effect/` (CHECKLIST + HANDOFF + BRAIN) | Faze 13–18c: potpisnik, evidentičar A/B, transferi v2, uništenje, popisni rashod, UI | ✅ 49/50 |
| `full_effect_implementation_*.plan.md`, `full_effect_part_2_*.plan.md` | Izvorni Part 1/2 planovi za Full Effect | 🗄 (izvršeno po `full-effect/CHECKLIST.md`) |
| `skladišni_lot_i_evidentičar/` + `skladišni_lot_i_evidentičar_*.plan.md` | Skladišni lot + WH komisije popisa | ✅ 100% |
| `popisni-rashod-faza5/` | Scheduler, production mode, disposal lista | 🟡 kod postoji; CHECKLIST zastario (v. BACKLOG §20) |
| `compose_toast_matrice_*.plan.md` | Toast + matrice prolaz | ✅ |

## B. Popis i rashod

| Plan | Status |
|------|--------|
| `auto_slotovi_popisa_*`, `fix_slotovi_i_rashod_*`, `popis_scope_i_print_*`, `popis_komisija_i_štampa_*` | ✅ |
| `popisni_rashod_workflow_*`, `rashod_samo_sa_skladišta_*`, `ui_ux_rashod_polish_*`, `sesija_rashod_pretraga_*` | ✅ |
| `popis-po-skladistu/` (HANDOFF), `popis-temp-actions-on-close_*` | ✅ (smoke u BACKLOG-u) |

## C. Skladišta, lotovi, prenosnice

| Plan | Status |
|------|--------|
| `skladište_ui_prenosnice+_a1fb1146/` + plan, `prenosnice_registry_template_*` | ✅ |
| `kanonski_dest_lot_*`, `fix_cross-warehouse_lot_prikaz_*`, `kolaudacija_opreme_lot_*` | ✅ |
| `relocation_lot_accounting_*`, `relocation_spec_inheritance_*`, `spec_polja_lot_vs_komad_*` | ✅ |
| `routing-i-lot-spec/` + `routing_i_lot_spec_*`, `child_host_maintenance_links_*` | ✅ |
| `warehouse_scope_bez_grada_*`, `warehouse_scope_cleanup_*` | ✅ |

## D. Evidentičar, uloge, organizacija

| Plan | Status |
|------|--------|
| `evidenticar-dodjele/` (HANDOFF), `evidentičar_dodjele_*`, `evidentičar_cross-issue_scope_*`, `evidenticar_scope_fix_*` | 🟡 kod ✅, ručni QA 1–15 otvoren |
| `moderator_role_implementation_*`, `moderator_scoped_admin_*` | ✅ |
| `org_hijerarhija_update_fccb007f/` + plan, `org_promjena_oprema_*`, `equipment_affiliation_field_*` | ✅ |
| `guard_audit_matrice/` (HANDOFF) + `guard_audit_matrice_*.plan.md` | 🟡 kod ✅, staging smoke otvoren |
| `onboarding_i_qr_public_*` | ✅ |

## E. Frontend / UX / performanse

| Plan | Status |
|------|--------|
| `list-performance/` (HANDOFF + QA_CHECKLIST), `backend_list_performance_*` | 🟡 kod ✅, QA s korisnicima otvoren |
| `frontend_dialog_i_browse_*`, `frontend_responsive_audit_*`, `dashboard_fixes_plan_*` | ✅ (responsive polish kao trajna stavka: BACKLOG) |
| `odrzavanje_i_postavke_meni/` (HANDOFF) + `održavanje_i_postavke_meni_*.plan.md` | ✅ |
| `fix_inventory_bugs_*`, `fix_follow-up_ux_bugs_*`, `override_preuzeo_placeholder_*` | ✅ |

## Napomena o duplikatima (2026-10-28)

Fajlovi s imenima tipa `…#U010d…` / `…#U0161…` bili su bajt-identične kopije
nastale pokvarenim Unicode enkodiranjem imena (ćčžš). Uklonjeni su u
reorganizaciji; kanonske verzije s dijakritikom su jedine preostale.
Stanje prije/poslije: [../../docs/STATUS.md](../../docs/STATUS.md) §5.

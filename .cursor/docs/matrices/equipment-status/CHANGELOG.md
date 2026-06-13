# Changelog — equipment-status

## 2026-06-13

- Drugi put nastanka opreme: **kolaudacija** iz skladišnog lota (`POST .../commission`) → `skladiste` + `na_skladistu`, bez transfera.

## 2026-06-04

- `POST /equipment` blokiran za sve uloge; jedini create put je issue iz skladišnog lota.
- UI Oprema: uklonjeno direktno kreiranje; ostaje uređivanje postojeće opreme.

## 2026-06-03

- Equipment se kreira pri issue iz skladišnog lota (`stockLotId`); skladištar više ne registruje opremu direktno.

## 2026-06-02

- Skladištar read/write pravila po keeper skladištu i statusu.

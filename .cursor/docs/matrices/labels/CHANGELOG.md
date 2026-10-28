# Changelog — labels

## 2026-10-28 (3)

- Audit sadržaja naljepnice prema specifikaciji (QR → naziv opreme → kategorija → serijski → inventurni): naziv opreme je sada `stockLot.productName` na **svim** formatima (prije se na naljepnicama < 26 mm nije štampao — F-20/F-01/F-10/F-40!), dva toggle-a za naziv spojena u jedan (`showEquipmentName`, migracija starih postavki), inventurni broj zaključan kao obavezan (uklonjen toggle, `sanitize` ga forsira na `true`).

## 2026-10-28 (2)

- Dodata kompletna Fornax F (ILK) porodica preseta (19 formata, uklj. F-20 52,5×21,2 mm / 56 po listu), grupisan izbor formata (Fornax / Avery / generičke), upozorenje za borderless margine samo kod prilagođenih mjera (fabrički formati „bez ruba" ga ne okidaju).

## 2026-10-28

- A4 studio za štampu naljepnica: standardni Avery formati + prilagođena geometrija (margine/kolone/redovi/razmaci u mm), orijentacija A4, početna pozicija (preskakanje polja, klik na pregled), kopije po artiklu, izbor sadržaja i QR pozicije/veličine, opcione vodilje u štampi, validacija i upozorenja, postavke u localStorage. Layout endžin + 14 novih unit testova; stara fiksna 2-kolonska mreža uklonjena.

## 2026-06-16

- Evidencijska oprema: na naljepnici prazna podcrtana linija umjesto štampanog inv. broja (QR ostaje isti).

## 2026-06-17

- Naljepnica: lot naziv, kategorija, serijski (ako postoji), bold inventurni broj, QR.

## 2026-06-03

- QR URL format; horizontalni layout naljepnice; javna stranica `/equipment/:id`.

## 2026-05-29

- LabelPrintSheet A4 batch; integracija na listama opreme i MyEquipment.

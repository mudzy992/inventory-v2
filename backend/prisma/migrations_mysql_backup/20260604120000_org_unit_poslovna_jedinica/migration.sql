-- AlterEnum: add poslovna_jedinica to OrgUnitType
ALTER TABLE `org_units` MODIFY `type` ENUM('direkcija', 'distribucija', 'podrucje', 'podruznica', 'poslovna_jedinica', 'sektor', 'sluzba', 'odjeljenje') NOT NULL;

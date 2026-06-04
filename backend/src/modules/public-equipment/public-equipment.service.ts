import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  buildEquipmentDisplayName,
  buildLabeledSpecifications,
  getUniqueFieldDisplay,
  type UniqueFieldDisplay,
} from '../../common/utils/equipment-display.util';

export interface PublicEquipmentResponse {
  id: string;
  inventoryNumber: string;
  status: string;
  categoryName: string;
  displayName: string;
  uniqueField: UniqueFieldDisplay | null;
  specifications: Record<string, string>;
}

@Injectable()
export class PublicEquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async findOne(id: string): Promise<PublicEquipmentResponse> {
    const lookupEnabled = await this.settingsService.isFeatureEnabled(
      'features.public_equipment_lookup',
      true,
    );
    if (!lookupEnabled) {
      throw new NotFoundException('Public equipment lookup is disabled');
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    const specifications = (equipment.specifications ?? {}) as Record<string, string>;
    return {
      id: equipment.id,
      inventoryNumber: equipment.inventoryNumber,
      status: equipment.status,
      categoryName: equipment.category.name,
      displayName: buildEquipmentDisplayName(equipment.category.name, specifications),
      uniqueField: getUniqueFieldDisplay(
        equipment.category.fields,
        equipment.category.optionalFields,
        specifications,
      ),
      specifications: buildLabeledSpecifications(
        equipment.category.fields,
        equipment.category.optionalFields,
        specifications,
      ),
    };
  }
}

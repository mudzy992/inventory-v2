import { isSystemAdmin } from '../auth/authorization-policy.util';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrgUnit } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgScopeService {
  constructor(private readonly prisma: PrismaService) {}

  hasFullAccess(user: AuthenticatedUser): boolean {
    return isSystemAdmin(user);
  }

  async resolveScopedOrgUnitIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (this.hasFullAccess(user)) {
      return null;
    }
    return [];
  }

  async expandOrgUnitIds(rootIds: string[]): Promise<string[]> {
    const allUnits = await this.prisma.orgUnit.findMany({
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string | null, string[]>();
    for (const unit of allUnits) {
      const siblings = childrenByParent.get(unit.parentId) ?? [];
      siblings.push(unit.id);
      childrenByParent.set(unit.parentId, siblings);
    }
    const result = new Set<string>();
    const visit = (id: string): void => {
      if (result.has(id)) {
        return;
      }
      result.add(id);
      const children = childrenByParent.get(id) ?? [];
      for (const childId of children) {
        visit(childId);
      }
    };
    for (const rootId of rootIds) {
      visit(rootId);
    }
    return [...result];
  }

  async assertOrgUnitInScope(user: AuthenticatedUser, orgUnitId: string): Promise<void> {
    const scopedIds = await this.resolveScopedOrgUnitIds(user);
    if (scopedIds === null) {
      return;
    }
    if (!scopedIds.includes(orgUnitId)) {
      throw new ForbiddenException('Org unit outside your scope');
    }
  }

  buildOrgUnitTree(units: OrgUnit[]): OrgUnitTreeNode[] {
    const nodes = new Map<string, OrgUnitTreeNode>();
    for (const unit of units) {
      nodes.set(unit.id, {
        id: unit.id,
        name: unit.name,
        type: unit.type,
        parentId: unit.parentId,
        signerId: unit.signerId,
        children: [],
      });
    }
    const roots: OrgUnitTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}

export interface OrgUnitTreeNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  signerId: string | null;
  children: OrgUnitTreeNode[];
}

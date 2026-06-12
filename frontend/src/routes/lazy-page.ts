import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleWithExport = Record<string, ComponentType<unknown> | undefined>;

export const lazyPage = <T extends ComponentType<unknown>>(
  factory: () => Promise<ModuleWithExport>,
  exportName: string,
): LazyExoticComponent<T> =>
  lazy(() =>
    factory().then((module) => {
      const component = module[exportName];
      if (!component) {
        throw new Error(`Lazy page export "${exportName}" not found`);
      }
      return { default: component as T };
    }),
  );

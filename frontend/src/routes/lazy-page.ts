import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleWithExport = object;

export const lazyPage = <T extends ComponentType<any> = ComponentType<any>>(
  factory: () => Promise<ModuleWithExport>,
  exportName: string,
): LazyExoticComponent<T> =>
  lazy(() =>
    factory().then((module) => {
      const component = (module as Record<string, unknown>)[exportName];
      if (typeof component !== 'function') {
        throw new Error(`Lazy page export "${exportName}" not found`);
      }
      return { default: component as T };
    }),
  );

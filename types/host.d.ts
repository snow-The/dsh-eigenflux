/**
 * Minimal local declarations for the two host modules this plugin imports.
 *
 * WHY LOCAL STUBS: a DSH plugin is deployed INTO a host that already provides `cordis` and
 * `@deepseek-ai/dsh-tools`; bundling or installing them would risk a second copy at runtime, and
 * npm-installing them just to type-check would drag the host's dependency tree into this package.
 * dsh-skill-pack solves the same problem with `types/dsh-skill-filesystem.d.ts` plus a tsconfig
 * `paths` entry, and this follows that convention.
 *
 * Only the shapes actually used are declared. A stub that invents a wider surface would hide real
 * mistakes: if this plugin ever calls a host API that does not exist, the build must fail here.
 */

declare module 'cordis' {
  /** The plugin context handed to `apply`. Only what this plugin touches is declared. */
  export interface Context {
    tools: {
      register(definition: unknown): unknown;
    };
    logger?: {
      info(...args: unknown[]): void;
      warn(...args: unknown[]): void;
      error(...args: unknown[]): void;
    };
    effect?(callback: () => unknown, label?: string): unknown;
  }
}

declare module '@deepseek-ai/dsh-tools' {
  /**
   * Tool definition factory. The real signature is generic over the parameter schema; this plugin
   * passes a plain JSON-schema object and a typed execute, so the stub mirrors that usage without
   * pretending to reproduce the host's generic machinery.
   */
  export interface ToolDefinition<P, R> {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: { schema: Record<string, unknown>; render(agent: unknown, value: R): unknown[] };
    execute(args: P, exec: unknown): Promise<R> | R;
  }
  export function defineTool<P, R>(definition: ToolDefinition<P, R>): ToolDefinition<P, R>;
}

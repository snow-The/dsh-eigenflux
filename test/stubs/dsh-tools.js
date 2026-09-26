/**
 * Test-only stand-in for the host-provided `@deepseek-ai/dsh-tools`.
 *
 * The plugin is bundled with the host packages marked external, because at runtime the host already
 * provides them — shipping a copy would risk two instances of the same service. That means `dist`
 * cannot be imported without a host, so the unit suite redirects the import here.
 *
 * `defineTool` is the identity function in the real package too: it exists to carry types and to
 * validate the definition shape. Reproducing that faithfully is enough for a test that asserts which
 * tools a plugin registers and what they do when called.
 */
export function defineTool(definition) {
  if (definition == null || typeof definition !== 'object') {
    throw new TypeError('defineTool: expected a tool definition object');
  }
  if (typeof definition.name !== 'string' || definition.name.length === 0) {
    throw new TypeError('defineTool: a tool needs a name');
  }
  if (typeof definition.execute !== 'function') {
    throw new TypeError(`defineTool: ${definition.name} needs an execute function`);
  }
  return definition;
}

export default { defineTool };

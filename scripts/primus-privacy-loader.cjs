// Suppress upstream diagnostic output without replacing proof/signature logic.
const ts = require('typescript');
module.exports = function privacyLoader(source) {
  // Optional best-effort SDK analytics includes error payloads. Disable it locally.
  if (/[\\/]utils[\\/]eventReport\.js$/.test(this.resourcePath)) {
    return 'export function eventReport() { return Promise.resolve(); }';
  }
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
    transformers: { before: [context => {
      const visit = node => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console') {
          return context.factory.createVoidZero();
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }] },
  });
  return result.outputText;
};

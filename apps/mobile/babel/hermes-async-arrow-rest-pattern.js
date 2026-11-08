/**
 * Hermes (React Native 0.88.1) can't parse an async arrow function whose rest parameter is a
 * destructuring pattern, `async (...[a, b = {}]) => …` ("invalid destructuring target"). oRPC's
 * client ships exactly that, so the app crashed on launch once babel-preset-expo 58.0.24 dropped
 * its own fix for it (`fix-hermes-v1-async-arrow-non-simple-params`, still in 58.0.13).
 *
 * Rewrites only that form, to a plain rest parameter destructured at the top of the body:
 * `async (...[a, b = {}]) => body` → `async (..._rest) => { var [a, b = {}] = _rest; … }`.
 * Every other parameter shape compiles on this Hermes, so the rest is left alone.
 *
 * Delete this file and babel.config.js once the Hermes that ships with React Native parses it:
 * `echo 'var f = async (...[a]) => a;' > t.js && hermesc -emit-binary -out t.hbc t.js`.
 */
module.exports = function hermesAsyncArrowRestPattern({ types: t }) {
  return {
    name: "hermes-async-arrow-rest-pattern",
    visitor: {
      ArrowFunctionExpression(path) {
        const { node } = path;
        if (!node.async) return;
        const rest = node.params[node.params.length - 1];
        if (!t.isRestElement(rest) || t.isIdentifier(rest.argument)) return;

        const id = path.scope.generateUidIdentifier("rest");
        const pattern = rest.argument;
        rest.argument = id;
        const body = t.isBlockStatement(node.body) ? node.body : t.blockStatement([t.returnStatement(node.body)]);
        body.body.unshift(t.variableDeclaration("var", [t.variableDeclarator(pattern, t.cloneNode(id))]));
        node.body = body;
      },
    },
  };
};

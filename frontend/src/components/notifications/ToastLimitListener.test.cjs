/* eslint-disable @typescript-eslint/no-require-imports -- Node-based component test harness. */
// Regression: in Chrome no confirmation/error toast was painted in Ventas. react-hot-toast 2.6
// removes the FIRST "default" store listener when any subscriber unmounts; ToastLimitListener
// mounted late inside SessionBoundary (and StrictMode re-ran its effect), detaching <Toaster>.
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const ts = require("typescript");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000/" });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.getComputedStyle = dom.window.getComputedStyle;
global.MutationObserver = dom.window.MutationObserver;
global.matchMedia = window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
require.extensions[".tsx"] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(source, filename);
};

const React = require("react");
const { render, screen, act, cleanup } = require("@testing-library/react");
const hot = require("react-hot-toast");
const ToastLimitListener = require("./ToastLimitListener.tsx").default;
const h = React.createElement;
const sleep = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

afterEach(async () => { await act(async () => hot.default.remove()); cleanup(); });

// Late mount = how SessionBoundary rendered it (null first, children after the session check).
function Late({ children }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  return ready ? children : null;
}

test("the old layout (listener mounted late under StrictMode) detaches the Toaster", async () => {
  render(h(React.StrictMode, null, h(Late, null, h(ToastLimitListener)), h(hot.Toaster)));
  await sleep(0);
  await act(async () => hot.default("visible?"));
  assert.equal(screen.queryByText("visible?"), null, "library hazard reproduced");
});

test("current layout: listener beside the Toaster paints toasts and keeps confirmations open", async () => {
  render(h(React.StrictMode, null, h(ToastLimitListener), h(hot.Toaster)));
  await sleep(0);
  await act(async () => {
    hot.default("aviso");
    hot.default.custom(() => h("p", null, "¿Confirmás?"), { duration: Infinity });
  });
  assert.ok(screen.getByText("aviso"));
  assert.ok(screen.getByText("¿Confirmás?"));
  await sleep(3300); // past ToastLimitListener's 3 s cap
  assert.ok(screen.getByText("¿Confirmás?"), "a confirmation waits for the user");
});

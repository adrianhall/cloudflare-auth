// Full canvas mock for the jsdom environment.
// vitest-canvas-mock implements the complete Canvas API with parameter
// validation and vi.fn() spies, suppressing jsdom's "Not implemented:
// HTMLCanvasElement.getContext()" warnings without a native build dependency.
import "vitest-canvas-mock";

// Suppress jsdom's "Not implemented: Window.getComputedStyle() with pseudo-elements"
// warnings. axe-core calls getComputedStyle() with pseudo-element arguments (e.g.
// ::before, ::after) when checking CSS-generated content. jsdom does not implement
// pseudo-element style resolution, and computed styles are not relevant for the
// structural accessibility checks covered by this project.
const _originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element: Element, pseudoElt?: string | null): CSSStyleDeclaration => {
  if (pseudoElt) {
    return {} as CSSStyleDeclaration;
  }
  return _originalGetComputedStyle(element);
};

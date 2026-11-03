import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";
import { byId } from "./testid";

describe("App", () => {
  it("renders the root placeholder", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const placeholder = screen.getByTestId("root-placeholder");
    expect(placeholder).toBeInstanceOf(HTMLDivElement);
    expect(byId("root-placeholder")).toBe('[data-testid="root-placeholder"]');
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SlotButton } from "@/features/guest/book/SlotButton";

describe("SlotButton", () => {
  it("formats the time in the owner timezone and preserves the ISO testid", () => {
    const startsAt = "2026-11-04T06:00:00.000Z";

    render(<SlotButton startsAt={startsAt} />);

    const button = screen.getByTestId(`slot-${startsAt}`);
    expect(button).toHaveTextContent("09:00");
    expect(button).toHaveTextContent(/^09:00$/);
  });
});

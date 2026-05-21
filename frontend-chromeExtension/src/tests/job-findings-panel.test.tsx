import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { JobFindingsPanel } from "../components/JobFindingsPanel";
import { Finding } from "../types/backend";
import { ThemeProvider } from "@mui/material";
import { getTheme } from "../theme";

const mockFindings: Finding[] = [
  {
    id: "f1",
    file_path: "src/app.ts",
    line_number: 42,
    severity: "high",
    agent: "code_review",
    message: "Unused variable 'unused'",
    suggested_code: "// Remove line 42",
    confidence: 0.95,
  },
  {
    id: "f2",
    file_path: "src/utils.ts",
    line_number: 15,
    severity: "medium",
    agent: "security",
    message: "Missing error handling",
    suggested_code: "try { ... } catch (e) { console.error(e); }",
    confidence: 0.87,
  },
];

const renderWithTheme = (component: React.ReactElement) => {
  const theme = getTheme("dark");
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("JobFindingsPanel", () => {
  it("should not render when findings array is empty", () => {
    const { container } = renderWithTheme(
      <JobFindingsPanel findings={[]} expanded={false} onToggle={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should display findings count", () => {
    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={false} onToggle={() => {}} />
    );
    expect(screen.getByText(/Findings \(2\)/)).toBeInTheDocument();
  });

  it("should show table when expanded", () => {
    const { container } = renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={true} onToggle={() => {}} />
    );
    const table = container.querySelector("table");
    expect(table).toBeVisible();
  });

  it("should call onToggle when expand trigger is clicked", () => {
    const onToggle = jest.fn();
    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={false} onToggle={onToggle} />
    );
    const trigger = screen.getByText(/Findings \(2\)/);
    fireEvent.click(trigger);
    expect(onToggle).toHaveBeenCalled();
  });

  it("should support keyboard activation (Enter key)", () => {
    const onToggle = jest.fn();
    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={false} onToggle={onToggle} />
    );
    const trigger = screen.getByLabelText(/Findings: 2 issues/);
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onToggle).toHaveBeenCalled();
  });

  it("should display all finding columns", () => {
    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Severity")).toBeInTheDocument();
  });

  it("should have proper ARIA attributes", () => {
    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={false} onToggle={() => {}} />
    );
    const trigger = screen.getByLabelText(/Findings: 2 issues/);
    expect(trigger).toHaveAttribute("role", "button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("should copy code to clipboard", () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });

    renderWithTheme(
      <JobFindingsPanel findings={mockFindings} expanded={true} onToggle={() => {}} />
    );
    const copyButtons = screen.getAllByLabelText(/Copy suggested code/);
    return act(async () => {
      fireEvent.click(copyButtons[0]);
      await Promise.resolve();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockFindings[0].suggested_code);
    });
  });
});

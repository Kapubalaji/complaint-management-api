import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "../components/Sidebar.jsx";
import { menuForRole } from "../constants.js";

const items = [
  { key: "dashboard", label: "Dashboard", icon: "D" },
  { key: "analytics", label: "Analytics", icon: "A" },
  { key: "complaints", label: "My Complaints", icon: "C" },
  { key: "logout", label: "Log out", icon: "L" },
];

function renderSidebar(props = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <Sidebar
      items={items}
      active="dashboard"
      username="casey"
      role="user"
      {...props}
      onSelect={props.onSelect || onSelect}
      onClose={props.onClose || onClose}
    />
  );
  return { ...utils, onSelect, onClose };
}

describe("navigation menu contents", () => {
  it("offers analytics to every role", () => {
    for (const role of ["user", "staff", "admin"]) {
      const keys = menuForRole(role).map((item) => item.key);
      expect(keys).toContain("analytics");
    }
  });

  it("keeps user management admin-only", () => {
    expect(menuForRole("user").map((i) => i.key)).not.toContain("users");
    expect(menuForRole("staff").map((i) => i.key)).not.toContain("users");
    expect(menuForRole("admin").map((i) => i.key)).toContain("users");
  });
});

describe("Sidebar drawer", () => {
  it("renders all menu items", () => {
    renderSidebar();
    expect(screen.getByTestId("menu-dashboard")).toBeTruthy();
    expect(screen.getByTestId("menu-analytics")).toBeTruthy();
    expect(screen.getByTestId("menu-complaints")).toBeTruthy();
    expect(screen.getByTestId("menu-logout")).toBeTruthy();
    expect(screen.getByTestId("menu-analytics").textContent).toBe("Analytics");
  });

  it("marks the active page", () => {
    renderSidebar({ active: "analytics" });
    expect(screen.getByTestId("menu-analytics").className).toContain("active");
    expect(screen.getByTestId("menu-dashboard").className).not.toContain("active");
  });

  it("is closed by default and open when opened", () => {
    const { rerender } = renderSidebar({ open: false });
    expect(document.querySelector(".sidebar").className).toBe("sidebar");
    expect(document.querySelector(".sidebar-backdrop")).toBeNull();

    rerender(
      <Sidebar
        items={items}
        active="dashboard"
        username="casey"
        role="user"
        open
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    expect(document.querySelector(".sidebar").className).toBe("sidebar open");
    expect(document.querySelector(".sidebar-backdrop")).toBeTruthy();
  });

  it("selects an item and reports the key", () => {
    const { onSelect } = renderSidebar();
    fireEvent.click(screen.getByTestId("menu-analytics"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("analytics");
  });

  it("closes from the close button and from the backdrop", () => {
    const { onClose } = renderSidebar({ open: true });

    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector(".sidebar-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the signed-in identity", () => {
    renderSidebar();
    expect(screen.getByText("casey")).toBeTruthy();
    expect(screen.getByText("user")).toBeTruthy();
  });
});

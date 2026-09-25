---
name: chrome-extension-ui
description: >-
  Expert guide and design system rules for crafting world-class, responsive, accessible,
  and CSP-compliant Chrome extension user interfaces (popups, side panels, devtools).
  Use whenever designing, refactoring, or building UI components for Chrome extensions.
---

# Chrome Extension UI Engineering & Design System

This skill defines the technical constraints, architectural standards, and design system tokens for creating high-performance, visually stunning Chrome extension user interfaces (Manifest V3).

---

## 1. Viewport & Layout Constraints

Unlike standard web applications, Chrome extension popups live inside a fixed-dimension browser flyout with strict boundary constraints:

| Dimension | Constraint | Recommended Range | Critical Rule |
| :--- | :--- | :--- | :--- |
| **Max Width** | 800px hard limit | 760px – 800px | Never exceed 800px; popups clamp and cause ugly horizontal scrollbars. |
| **Max Height** | 600px hard limit | 540px – 580px | Set `max-height: 600px; height: 580px; overflow-y: hidden;` on body. |
| **Overflow-X** | Strictly forbidden | `overflow-x: hidden;` | Prevent any flex child or grid column from stretching beyond viewport. |
| **Scroll Strategy** | Sticky Anchors | Fixed Header + Sticky Footer | Only the content body (`.container` or `.scrollable-area`) should scroll. |

### Shell Boilerplate Pattern
```css
html, body {
  width: 780px;
  height: 580px;
  margin: 0;
  padding: 0;
  overflow: hidden; /* Header & footer remain fixed; inner body scrolls */
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--surface-subdued);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.main-scrollable {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px;
}
```

---

## 2. Design Tokens & Visual Hierarchy

Follow the **Shopify Polaris / Linear** modern SaaS aesthetic:

### Color Tokens
```css
:root {
  /* Surfaces */
  --surface-primary: #FFFFFF;
  --surface-subdued: #F8F9FA;
  --surface-hover: #F1F3F5;
  --surface-active: #E9ECEF;
  --surface-border: #E5E7EB;
  --surface-border-subtle: #F3F4F6;
  
  /* Text */
  --text-primary: #111827;
  --text-secondary: #4B5563;
  --text-muted: #9CA3AF;
  
  /* Accents & Signals */
  --emerald-base: #008060;
  --emerald-subtle: #EBF5F1;
  --emerald-border: #A3D8C3;
  
  --blue-base: #0969DA;
  --blue-subtle: #EEF4FC;
  --blue-border: #A8C7FA;
  
  --amber-base: #B45309;
  --amber-subtle: #FEF3C7;
  --amber-border: #FCD34D;
  
  --rose-base: #D92D20;
  --rose-subtle: #FEE4E2;
  
  /* Elevation Shadows */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  
  /* Animation Timing */
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --transition-fast: 150ms var(--ease-spring);
  --transition-normal: 220ms var(--ease-spring);
}
```

---

## 3. Core Component Standards

### 3.1 Sticky Glassmorphic Header
- Contains project logo/shield, title, version, live audit badge, and active store hostname.
- Embeds a `.myshopify.com` handle chip with 1-click clipboard copy + checkmark tooltip.
- Uses `backdrop-filter: blur(12px)` and subtle border for elevation.

### 3.2 Summary Metric KPI Cards
- 4-card metric strip displaying key metrics at a glance (e.g. Active, Scripts, Residuals, Theme).
- Numbers formatted with `font-variant-numeric: tabular-nums` for rock-solid stability during live counts.

### 3.3 Live Real-Time Search & Category Filters
- Fast client-side filter input (`type="search"`) to instantly search apps by name or category across all triage columns.
- Triage filter tabs (`All`, `Active`, `Scripts`, `Residuals`) for focused analysis.

### 3.4 Interactive App Cards
- Letter/Avatar badge with category-based gradient coloring.
- Direct external link button to the official Shopify App Store page (`apps.shopify.com/<slug>`).
- Detection method tags (`Theme Block`, `ScriptTag`, `CDN`, `Liquid Snippet`).
- Conditional alternative suggestion cards (`💡 Tip: Try ...`).
- Staggered entrance animations (`animation-delay: calc(var(--index) * 40ms)`).

### 3.5 Loading Skeleton & Empty States
- Shimmer skeleton cards during active inspection instead of a jarring blank screen.
- Friendly, contextual empty states (e.g., "Clean Theme — No ghost code detected!").

### 3.6 Non-Shopify Gateway Overlay
- Frosted glass backdrop blur (`backdrop-filter: blur(20px);`) when active tab is not a Shopify store.
- Clear, welcoming prompt with a CTA or status indicator.

---

## 4. Strict Security & CSP Rules (Chrome MV3)

Chrome Manifest V3 enforces strict Content Security Policy (CSP):
1. **Never use inline event handlers** like `onclick="..."` or `href="javascript:..."`.
2. **Never inject inline `<style>` tags** dynamically via JavaScript. Use CSS classes and custom property variables (`element.style.setProperty('--var', value)`).
3. **Use self-contained SVG vectors** embedded directly in HTML or as image assets — never rely on external font kits (e.g. FontAwesome CDN) or external script tags.
4. **Use `navigator.clipboard.writeText`** for 1-click copying with visual feedback chips.
5. **Always sanitize or escape dynamic text content** with `element.textContent` or strict template strings before injecting.

---

## 5. UI Checklist Before Releasing

- [ ] Shell respects 800px width and ≤600px height.
- [ ] No horizontal scrollbars appear under any condition (`overflow-x: hidden`).
- [ ] Header and action footer stay pinned; only content cards scroll.
- [ ] 1-Click copy provides immediate visual confirmation (e.g. "Copied!").
- [ ] Non-Shopify tabs display the frosted gateway cleanly.
- [ ] Passes `node --check` and console has 0 errors or CSP warnings.

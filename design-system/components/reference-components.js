/* @ds-bundle: {"format":4,"namespace":"Glazed","components":[{"name":"Icon"},{"name":"Button"},{"name":"TextField"},{"name":"Select"},{"name":"Checkbox"},{"name":"Badge"},{"name":"Card"},{"name":"StatCard"},{"name":"DataTable"},{"name":"Tabs"},{"name":"SidebarNav"},{"name":"Alert"}]} */
(function () {
  var R = window.React, h = R.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }

  /* Icons: 24px grid, 1.75 stroke, round caps. Lucide-compatible names. */
  var P = {
    home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    box: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
    cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01",
    truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01",
    users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5 10 17 19 7",
    chevronDown: "m6 9 6 6 6-6",
    chevronRight: "m9 6 6 6-6 6",
    arrowUp: "M12 19V5M6 11l6-6 6 6",
    arrowDown: "M12 5v14M6 13l6 6 6-6",
    filter: "M3 5h18l-7 8.5V19l-4 2v-7.5z",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01",
    alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
    checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12.5l3 3 5-6",
    x: "M6 6l12 12M18 6 6 18",
    more: "M5 12h.01M12 12h.01M19 12h.01"
  };
  function Icon(p) {
    var size = p.size || 18;
    return h("svg", { className: cx("gz-icon", p.className), width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": p.label ? undefined : true, role: p.label ? "img" : undefined, "aria-label": p.label },
      h("path", { d: P[p.name] || P.box }));
  }

  function Button(p) {
    var variant = p.variant || "secondary", size = p.size || "md";
    var rest = Object.assign({}, p); ["variant", "size", "icon", "iconRight", "className", "children"].forEach(function (k) { delete rest[k]; });
    return h("button", Object.assign({ type: "button" }, rest, { className: cx("gz-btn", "gz-btn--" + variant, "gz-btn--" + size, !p.children && "gz-btn--icon", p.className) }),
      p.icon && h(Icon, { name: p.icon, size: size === "sm" ? 16 : 18 }),
      p.children && h("span", null, p.children),
      p.iconRight && h(Icon, { name: p.iconRight, size: size === "sm" ? 16 : 18 }));
  }

  var uid = 0;
  function useId(id) { var r = R.useRef(id || ("gz-" + (++uid))); return r.current; }

  function Field(p, control, id) {
    return h("div", { className: cx("gz-field", p.error && "is-error", p.className) },
      p.label && h("label", { className: "gz-field__label", htmlFor: id }, p.label, p.required && h("span", { className: "gz-field__req", "aria-hidden": true }, " *")),
      control,
      (p.error || p.hint) && h("div", { id: id + "-msg", className: p.error ? "gz-field__error" : "gz-field__hint" }, p.error && h(Icon, { name: "alert", size: 14 }), p.error || p.hint));
  }
  function TextField(p) {
    var id = useId(p.id);
    var rest = Object.assign({}, p); ["label", "hint", "error", "icon", "className", "suffix"].forEach(function (k) { delete rest[k]; });
    var input = h("div", { className: cx("gz-input", p.icon && "has-icon", p.disabled && "is-disabled") },
      p.icon && h(Icon, { name: p.icon, size: 16 }),
      h("input", Object.assign({}, rest, { id: id, "aria-invalid": !!p.error || undefined, "aria-describedby": (p.error || p.hint) ? id + "-msg" : undefined })),
      p.suffix && h("span", { className: "gz-input__suffix" }, p.suffix));
    return Field(p, input, id);
  }
  function Select(p) {
    var id = useId(p.id);
    var rest = Object.assign({}, p); ["label", "hint", "error", "options", "className"].forEach(function (k) { delete rest[k]; });
    var sel = h("div", { className: cx("gz-input", "gz-select", p.disabled && "is-disabled") },
      h("select", Object.assign({}, rest, { id: id, "aria-invalid": !!p.error || undefined }),
        (p.options || []).map(function (o) { o = typeof o === "string" ? { value: o, label: o } : o; return h("option", { key: o.value, value: o.value }, o.label); })),
      h(Icon, { name: "chevronDown", size: 16 }));
    return Field(p, sel, id);
  }
  function Checkbox(p) {
    var rest = Object.assign({}, p); ["label", "className"].forEach(function (k) { delete rest[k]; });
    return h("label", { className: cx("gz-check", p.disabled && "is-disabled", p.className) },
      h("input", Object.assign({ type: "checkbox" }, rest)),
      h("span", { className: "gz-check__box", "aria-hidden": true }, h(Icon, { name: "check", size: 14 })),
      p.label && h("span", null, p.label));
  }

  function Badge(p) {
    var tone = p.tone || "neutral";
    return h("span", { className: cx("gz-badge", "gz-badge--" + tone, p.className) }, p.dot !== false && h("span", { className: "gz-badge__dot", "aria-hidden": true }), p.children);
  }

  function Card(p) {
    return h("section", { className: cx("gz-card", p.padded === false && "gz-card--flush", p.className) },
      (p.title || p.actions) && h("header", { className: "gz-card__head" },
        h("div", null, p.title && h("h2", { className: "gz-card__title" }, p.title), p.subtitle && h("p", { className: "gz-card__sub" }, p.subtitle)),
        p.actions && h("div", { className: "gz-card__actions" }, p.actions)),
      h("div", { className: "gz-card__body" }, p.children));
  }

  function StatCard(p) {
    var up = p.trend === "up", down = p.trend === "down";
    return h("div", { className: cx("gz-stat", p.className) },
      h("div", { className: "gz-stat__top" },
        h("span", { className: "gz-stat__label" }, p.label),
        p.icon && h("span", { className: cx("gz-stat__icon", "gz-tint--" + (p.tint || "pink")) }, h(Icon, { name: p.icon, size: 18 }))),
      h("div", { className: "gz-stat__value" }, p.value),
      (p.delta || p.caption) && h("div", { className: "gz-stat__foot" },
        p.delta && h("span", { className: cx("gz-delta", up && "is-up", down && "is-down") }, (up || down) && h(Icon, { name: up ? "arrowUp" : "arrowDown", size: 14 }), p.delta),
        p.caption && h("span", { className: "gz-stat__cap" }, p.caption)));
  }

  function DataTable(p) {
    var cols = p.columns || [], rows = p.rows || [];
    var sel = p.selectedKeys || [];
    return h("div", { className: cx("gz-table-wrap", p.className) },
      h("table", { className: cx("gz-table", p.density === "compact" && "gz-table--compact") },
        h("thead", null, h("tr", null, cols.map(function (c) {
          return h("th", { key: c.key, style: { textAlign: c.align || "left", width: c.width } }, c.header);
        }))),
        h("tbody", null, rows.length ? rows.map(function (r, i) {
          var k = r[p.rowKey || "id"] != null ? r[p.rowKey || "id"] : i;
          return h("tr", { key: k, className: sel.indexOf(k) > -1 ? "is-selected" : undefined, onClick: p.onRowClick ? function () { p.onRowClick(r); } : undefined },
            cols.map(function (c) { return h("td", { key: c.key, className: c.mono ? "gz-mono" : undefined, style: { textAlign: c.align || "left" } }, c.render ? c.render(r) : r[c.key]); }));
        }) : h("tr", null, h("td", { className: "gz-table__empty", colSpan: cols.length }, p.empty || "Nothing here yet.")))));
  }

  function Tabs(p) {
    var st = R.useState(p.value != null ? p.value : (p.items[0] && p.items[0].value));
    var v = p.value != null ? p.value : st[0];
    return h("div", { className: cx("gz-tabs", p.className), role: "tablist" }, p.items.map(function (t) {
      var on = t.value === v;
      return h("button", { key: t.value, role: "tab", type: "button", "aria-selected": on, className: cx("gz-tab", on && "is-active"), onClick: function () { st[1](t.value); p.onChange && p.onChange(t.value); } },
        t.label, t.count != null && h("span", { className: "gz-tab__count" }, t.count));
    }));
  }

  function SidebarNav(p) {
    return h("nav", { className: cx("gz-nav", p.className), "aria-label": "Main" },
      p.brand && h("div", { className: "gz-nav__brand" }, h("span", { className: "gz-nav__mark", "aria-hidden": true }), p.brand),
      (p.sections || []).map(function (s, si) {
        return h("div", { key: si, className: "gz-nav__section" },
          s.title && h("div", { className: "gz-nav__title" }, s.title),
          s.items.map(function (it) {
            var on = it.value === p.active;
            return h("a", { key: it.value, href: it.href || "#", className: cx("gz-nav__item", on && "is-active"), "aria-current": on ? "page" : undefined, onClick: p.onSelect ? function (e) { e.preventDefault(); p.onSelect(it.value); } : undefined },
              it.icon && h(Icon, { name: it.icon, size: 18 }), h("span", null, it.label), it.badge != null && h("span", { className: "gz-nav__badge" }, it.badge));
          }));
      }));
  }

  function Alert(p) {
    var tone = p.tone || "info";
    var ic = { info: "info", success: "checkCircle", warning: "alert", danger: "alert" }[tone];
    return h("div", { className: cx("gz-alert", "gz-alert--" + tone, p.className), role: tone === "danger" ? "alert" : "status" },
      h(Icon, { name: ic, size: 18 }),
      h("div", { className: "gz-alert__body" }, p.title && h("div", { className: "gz-alert__title" }, p.title), p.children && h("div", null, p.children)),
      p.action && h("div", { className: "gz-alert__action" }, p.action));
  }

  window.Glazed = Object.assign(window.Glazed || {}, { Icon: Icon, Button: Button, TextField: TextField, Select: Select, Checkbox: Checkbox, Badge: Badge, Card: Card, StatCard: StatCard, DataTable: DataTable, Tabs: Tabs, SidebarNav: SidebarNav, Alert: Alert });
})();

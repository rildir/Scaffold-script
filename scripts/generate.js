#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const name = args[0];
const flags = {
  dryRun: args.includes("--dry-run"),
  noRoute: args.includes("--no-route"),
  noBarrel: args.includes("--no-barrel"),
  help: args.includes("--help") || args.includes("-h"),
};

if (flags.help) {
  console.log(`
Usage:
  npm run g -- <name> [options]

Options:
  --dry-run     Preview files without writing them
  --no-route    Skip automatic route registration
  --no-barrel   Skip index.ts barrel export generation
  -h, --help    Show this help message

Examples:
  npm run g -- dashboard
  npm run g -- user-profile
  npm run g -- invoiceList --dry-run
`);
  process.exit(0);
}

if (!name) {
  console.error("\n❌  Please provide a component name.\n");
  console.error("   Usage: npm run g -- <name>\n");
  console.error("   Example: npm run g -- dashboard\n");
  process.exit(1);
}

const toKebabCase = (str) =>
  str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

const toPascalCase = (str) =>
  toKebabCase(str)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const toConstantCase = (str) =>
  toKebabCase(str).replace(/-/g, "_").toUpperCase();

const kebab = toKebabCase(name);
const pascal = toPascalCase(name);
const constant = toConstantCase(name);

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, "src", "app", "pages");
const TARGET_DIR = path.join(PAGES_DIR, kebab);
const ROUTES_FILE = path.join(ROOT, "src", "app", "app.routes.ts");

if (!flags.dryRun && fs.existsSync(TARGET_DIR)) {
  console.error(`\n❌  Directory already exists: ${TARGET_DIR}\n`);
  process.exit(1);
}

const templates = {
  [`${kebab}.model.ts`]: `/**
 * ${pascal} domain models.
 * Replace the placeholder fields with your actual data shape.
 */
export interface ${pascal}Item {
  id: number | string;
  // TODO: add domain-specific fields here
}

export interface ${pascal}State {
  items: ${pascal}Item[];
  selectedItem: ${pascal}Item | null;
  loading: boolean;
  error: string | null;
}
`,

  [`${kebab}.store.ts`]: `import { Injectable } from '@angular/core';
import { BaseStore } from '../../core/stores/base.store';
import { ${pascal}State } from './${kebab}.model';

const initialState: ${pascal}State = {
  items: [],
  selectedItem: null,
  loading: false,
  error: null,
};

/**
 * ${pascal}Store
 *
 * Manages all UI state for the ${pascal} feature.
 * Business logic lives in ${pascal}Service — this store is state-only.
 */
@Injectable({ providedIn: 'root' })
export class ${pascal}Store extends BaseStore<${pascal}State> {
  constructor() {
    super(initialState);
  }
}
`,

  [`${kebab}.service.ts`]: `import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, tap, throwError } from 'rxjs';
import { ${pascal}Store } from './${kebab}.store';
import { ${pascal}Item } from './${kebab}.model';
import { ${constant}_CONFIG } from './${kebab}.config';

/**
 * ${pascal}Service
 *
 * Responsible for all data fetching and mutations.
 * Updates the store on success / failure.
 */
@Injectable({ providedIn: 'root' })
export class ${pascal}Service {
  private readonly http = inject(HttpClient);
  private readonly store = inject(${pascal}Store);

  fetchAll(): Observable<${pascal}Item[]> {
    this.store.patch({ loading: true, error: null });

    return this.http.get<${pascal}Item[]>(${constant}_CONFIG.ENDPOINTS.FETCH).pipe(
      tap((items) => this.store.patch({ items })),
      catchError((err) => {
        const message = err?.message ?? 'An unexpected error occurred.';
        this.store.patch({ error: message });
        return throwError(() => err);
      }),
      finalize(() => this.store.patch({ loading: false })),
    );
  }

  save(payload: Partial<${pascal}Item>): Observable<${pascal}Item> {
    this.store.patch({ loading: true, error: null });

    return this.http.post<${pascal}Item>(${constant}_CONFIG.ENDPOINTS.SAVE, payload).pipe(
      tap((saved) => {
        const current = this.store.snapshot.items;
        const updated = current.some((i) => i.id === saved.id)
          ? current.map((i) => (i.id === saved.id ? saved : i))
          : [...current, saved];
        this.store.patch({ items: updated });
      }),
      catchError((err) => {
        const message = err?.message ?? 'Save failed.';
        this.store.patch({ error: message });
        return throwError(() => err);
      }),
      finalize(() => this.store.patch({ loading: false })),
    );
  }
}
`,

  [`${kebab}.config.ts`]: `/**
 * ${pascal} feature configuration.
 * Keep all magic strings, endpoints and feature flags here.
 */
export const ${constant}_CONFIG = {
  ENDPOINTS: {
    FETCH: '/api/v1/${kebab}',
    SAVE: '/api/v1/${kebab}/save',
  },
  PAGE_SIZE: 20,
} as const;
`,

  [`${kebab}.component.ts`]: `import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ${pascal}Store } from './${kebab}.store';
import { ${pascal}Service } from './${kebab}.service';

/**
 * ${pascal}Component
 *
 * Thin orchestration layer — delegates state to the store,
 * side-effects to the service, and keeps template logic minimal.
 */
@Component({
  selector: 'app-${kebab}',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './${kebab}.component.html',
  styleUrls: ['./${kebab}.component.css'],
})
export class ${pascal}Component implements OnInit {
  protected readonly store = inject(${pascal}Store);
  private readonly service = inject(${pascal}Service);

  ngOnInit(): void {
    this.service.fetchAll().subscribe();
  }
}
`,

  [`${kebab}.component.html`]: `<div class="${kebab}-container">

  <!-- Loading state -->
  <div *ngIf="store.state.loading" class="loading-indicator" role="status" aria-label="Loading">
    Loading…
  </div>

  <!-- Error state -->
  <div *ngIf="store.state.error" class="error-banner" role="alert">
    {{ store.state.error }}
  </div>

  <!-- Content -->
  <ng-container *ngIf="!store.state.loading && !store.state.error">
    <h1 class="page-title">${pascal}</h1>

    <ul class="item-list">
      <li *ngFor="let item of store.state.items; trackBy: trackById" class="item-list__row">
        {{ item | json }}
      </li>
    </ul>
  </ng-container>

</div>
`,

  [`${kebab}.component.css`]: `/* ── ${pascal} Component Styles ─────────────────────────────── */

.${kebab}-container {
  padding: 2rem;
  animation: page-enter 0.25s ease-out both;
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.loading-indicator {
  padding: 1rem;
  color: #666;
}

.error-banner {
  padding: 0.75rem 1rem;
  background-color: #fff0f0;
  border: 1px solid #ffcccc;
  border-radius: 6px;
  color: #c0392b;
  margin-bottom: 1rem;
}

.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.item-list__row {
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}
`,

  ...(!flags.noBarrel
    ? {
        "index.ts": `export { ${pascal}Component } from './${kebab}.component';
export { ${pascal}Store } from './${kebab}.store';
export { ${pascal}Service } from './${kebab}.service';
export type { ${pascal}Item, ${pascal}State } from './${kebab}.model';
`,
      }
    : {}),
};

if (flags.dryRun) {
  console.log(`\n🔍  Dry run — no files will be written.\n`);
  console.log(`   Target directory: ${TARGET_DIR}\n`);
  Object.keys(templates).forEach((f) => console.log(`   📄 ${f}`));
  if (!flags.noRoute) {
    console.log(`\n   📌 Route entry would be added to: ${ROUTES_FILE}`);
  }
  console.log("");
  process.exit(0);
}

try {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
} catch (err) {
  console.error(`\n❌  Failed to create directory: ${err.message}\n`);
  process.exit(1);
}

const written = [];
const failed = [];

Object.entries(templates).forEach(([fileName, content]) => {
  const filePath = path.join(TARGET_DIR, fileName);
  try {
    fs.writeFileSync(filePath, content, "utf8");
    written.push(fileName);
  } catch (err) {
    failed.push({ fileName, error: err.message });
  }
});

let routeRegistered = false;

if (!flags.noRoute && fs.existsSync(ROUTES_FILE)) {
  try {
    let routesContent = fs.readFileSync(ROUTES_FILE, "utf8");

    const routeEntry = `  {
    path: '${kebab}',
    loadComponent: () =>
      import('./pages/${kebab}/${kebab}.component').then(
        (m) => m.${pascal}Component,
      ),
  },`;

    const insertMarker = routesContent.lastIndexOf("];");
    if (insertMarker !== -1) {
      routesContent =
        routesContent.slice(0, insertMarker) +
        routeEntry +
        "\n" +
        routesContent.slice(insertMarker);
      fs.writeFileSync(ROUTES_FILE, routesContent, "utf8");
      routeRegistered = true;
    }
  } catch (err) {
    console.warn(`\n⚠️  Could not auto-register route: ${err.message}`);
    console.warn(`   Add the route manually to ${ROUTES_FILE}\n`);
  }
}

console.log(`\n🚀  Generating ${pascal} in:\n   ${TARGET_DIR}\n`);

written.forEach((f) => console.log(`   ✅  ${f}`));
failed.forEach(({ fileName, error }) =>
  console.error(`   ❌  ${fileName} — ${error}`),
);

if (routeRegistered) {
  console.log(`\n   📌  Route registered in app.routes.ts`);
} else if (!flags.noRoute && !fs.existsSync(ROUTES_FILE)) {
  console.warn(`\n   ⚠️   app.routes.ts not found — add the route manually:`);
  console.warn(`
      {
        path: '${kebab}',
        loadComponent: () =>
          import('./pages/${kebab}/${kebab}.component').then(
            (m) => m.${pascal}Component,
          ),
      }
  `);
}

if (failed.length > 0) {
  console.error(`\n⚠️  ${failed.length} file(s) failed to write.\n`);
  process.exit(1);
}

console.log(`\n🎉  Done! Next steps:`);
console.log(
  `   1. Open src/app/pages/${kebab}/${kebab}.model.ts and define your data shape.`,
);
console.log(`   2. Update ${kebab}.config.ts with the correct API endpoints.`);
console.log(`   3. Run the dev server and navigate to /${kebab}.\n`);

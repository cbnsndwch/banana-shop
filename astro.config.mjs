import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2, sandbox } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

// https://astro.build/config
export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// Friendly catalog manager for staff (runs in a sandboxed isolate).
			sandboxed: [
				{
					id: "catalog-manager",
					version: "0.1.0",
					format: "standard",
					entrypoint: "catalog-manager/sandbox",
					adminPages: [{ path: "/catalog", label: "Catalog", icon: "tag", group: "Shop" }],
				},
			],
			sandboxRunner: sandbox(),
			// Set to the public origin once deployed (also accepted via EMDASH_SITE_URL env).
			// Production origin comes from EMDASH_SITE_URL (wrangler.jsonc vars); previews use the request origin.
		}),
	],
	devToolbar: { enabled: false },
});

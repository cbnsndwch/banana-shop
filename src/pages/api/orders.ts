import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";
import { withEmDashRuntime } from "emdash/middleware";

/**
 * Public order submission. Validates input, recomputes the total from the
 * server's product prices (never trusts the client total), and writes the
 * order as a published `orders` content entry via the EmDash runtime.
 *
 * This is an internet-facing endpoint: it validates everything itself.
 */

export const POST: APIRoute = async ({ request }) => {
	if (request.method !== "POST") {
		return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "Invalid JSON body." }, 400);
	}

	const b = (body ?? {}) as Record<string, unknown>;
	const customer_name = typeof b.customer_name === "string" ? b.customer_name.trim() : "";
	const customer_email = typeof b.customer_email === "string" ? b.customer_email.trim() : "";
	const customer_phone = typeof b.customer_phone === "string" ? b.customer_phone.trim() : "";
	const pickup_name = typeof b.pickup_name === "string" ? b.pickup_name.trim() : "";
	// <input type="datetime-local"> sends "YYYY-MM-DDTHH:mm"; EmDash datetime fields want full ISO.
	const pickupMs = typeof b.pickup_date === "string" ? Date.parse(b.pickup_date) : NaN;
	const pickup_date = Number.isNaN(pickupMs) ? "" : new Date(pickupMs).toISOString();
	const pickup_location = typeof b.pickup_location === "string" ? b.pickup_location : "";
	const notes = typeof b.notes === "string" ? b.notes : "";
	const rawItems = Array.isArray(b.items) ? b.items : [];

	if (!customer_name) return json({ ok: false, error: "Your name is required." }, 400);
	if (!pickup_date) return json({ ok: false, error: "A pickup date and time is required." }, 400);
	if (!["kitchen", "market-stall"].includes(pickup_location))
		return json({ ok: false, error: "Choose a pickup location." }, 400);
	if (rawItems.length === 0) return json({ ok: false, error: "Add at least one item." }, 400);

	// Resolve product slugs + prices from the server. Never trust client prices.
	const { entries: products } = await getEmDashCollection("products", {
		status: "published",
		limit: 100,
	});
	const priceBySlug = new Map<string, { price: number; title: string }>();
	for (const p of products) {
		if (p.data.price != null) priceBySlug.set(p.id, { price: p.data.price, title: p.data.title });
	}

	const items: Array<{ product: string; quantity: number; unit_price: number }> = [];
	let total = 0;
	for (const raw of rawItems) {
		const it = raw as Record<string, unknown>;
		const slug = typeof it.product === "string" ? it.product : "";
		const quantity = Number(it.quantity);
		const prod = priceBySlug.get(slug);
		if (!prod || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
			return json({ ok: false, error: `Invalid item: ${slug || "(no product)"}` }, 400);
		}
		items.push({ product: prod.title, quantity, unit_price: prod.price });
		total += prod.price * quantity;
	}
	total = Math.round(total * 100) / 100;

	try {
		const id = await withEmDashRuntime(async (runtime) => {
			const created = await runtime.handleContentCreate("orders", {
				data: {
					customer_name,
					customer_email: customer_email || undefined,
					customer_phone: customer_phone || undefined,
					pickup_name: pickup_name || undefined,
					pickup_date,
					pickup_location,
					items,
					total,
					notes: notes || undefined,
					payment_method: "cash-on-pickup",
					order_status: "new",
				},
				// Published content needs a slug; orders aren't public pages, so any unique value works.
				slug: `order-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
				status: "published",
			});
			if ((created as any).error) throw new Error(`create failed: ${JSON.stringify((created as any).error)}`);
			const createdId = (created as any).data?.item?.id;
			if (!createdId) throw new Error("create returned no id");
			// Publish so the order shows immediately in the admin.
			await runtime.handleContentPublish("orders", createdId);
			return createdId;
		});
		return json({ ok: true, id }, 201);
	} catch (err) {
		return json({ ok: false, error: `Could not save your order: ${(err as Error).message}` }, 500);
	}
};

function json(obj: unknown, status: number): Response {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

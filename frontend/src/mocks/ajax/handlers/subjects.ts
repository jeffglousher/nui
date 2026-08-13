import { rest } from 'msw'

const snapshot = {
	captured_at: "2026-01-01T00:00:00Z",
	core: {
		enabled: true,
		filter: ">",
		listen_ms: 2000,
		heard: 1,
		truncated: false,
		subjects: [
			{ subject: "shop.orders.created", count: 2, last_payload: btoa("hello") },
		],
	},
	jetstream: {
		enabled: true,
		streams: [
			{
				name: "ORDERS",
				subjects: [
					{ subject: "shop.orders.created", count: 12 },
					{ subject: "shop.orders.shipped", count: 4 },
				],
			},
		],
	},
}

const handlers = [
	rest.get('/api/connection/:cnnId/subjects/last', async (req, res, ctx) => {
		return res(
			ctx.status(200),
			ctx.json({
				subject: req.url.searchParams.get("subject"),
				payload: btoa("last-from-stream"),
				seq_num: 12,
				received_at: "2026-01-01T00:00:00Z",
			}),
		)
	}),
	rest.get('/api/connection/:cnnId/subjects', async (req, res, ctx) => {
		return res(ctx.status(200), ctx.json(snapshot))
	}),
]

export default handlers

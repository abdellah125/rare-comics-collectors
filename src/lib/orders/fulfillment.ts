import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { queueTemplateEmail } from "@/lib/mail";
import { addOrderEvent, syncOrderStatus, type ActorRef } from "@/lib/orders/lifecycle";

export class FulfillmentError extends Error {}

export function trackingUrlFor(template: string | null | undefined, trackingNumber: string): string | null {
  if (!template || !trackingNumber) return null;
  return template.replace("{tracking}", encodeURIComponent(trackingNumber));
}

/**
 * Ships a set of items from one order. Sellers may only ship their own items;
 * admins can ship anything. Creates the shipment, moves items to "shipped",
 * recomputes the order status and notifies the buyer.
 */
export async function createShipment(input: {
  orderId: string;
  itemIds: string[];
  sellerId: string | null; // null = platform/admin acting on house inventory
  carrierId?: string | null;
  carrierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  note?: string | null;
  actor: { id: string; email: string; type: "admin" | "seller" };
}) {
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
  if (!order) throw new FulfillmentError("Order not found");
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") throw new FulfillmentError("The order isn't paid yet");
  const items = order.items.filter((i) => input.itemIds.includes(i.id));
  if (items.length === 0) throw new FulfillmentError("Choose at least one item");
  for (const i of items) {
    if (i.kind !== "comic") throw new FulfillmentError("Service bookings don't ship");
    if (input.actor.type === "seller" && i.sellerId !== input.sellerId) throw new FulfillmentError("You can only ship your own items");
    if (i.shipmentId) throw new FulfillmentError(`${i.title} is already in a shipment`);
    if (["cancelled", "refunded"].includes(i.status)) throw new FulfillmentError(`${i.title} is ${i.status}`);
  }
  const carrier = input.carrierId ? await db.carrier.findUnique({ where: { id: input.carrierId } }) : null;
  const trackingUrl = input.trackingUrl ?? (input.trackingNumber ? trackingUrlFor(carrier?.trackingUrlTemplate, input.trackingNumber) : null);

  const shipment = await db.$transaction(async (tx) => {
    const s = await tx.shipment.create({
      data: {
        orderId: order.id,
        sellerId: items[0].sellerId,
        carrierId: carrier?.id ?? null,
        carrierName: carrier?.name ?? input.carrierName ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl,
        status: "shipped",
        shippedAt: new Date(),
        note: input.note ?? null,
        events: { create: { status: "shipped", message: "Shipped", source: "manual" } },
      },
    });
    await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { shipmentId: s.id, status: "shipped" } });
    await addOrderEvent(tx, order.id, "shipment.created", `${items.map((i) => i.title).join(", ")} shipped${carrier ? ` via ${carrier.name}` : ""}${input.trackingNumber ? ` (${input.trackingNumber})` : ""}`, { id: input.actor.id, type: input.actor.type });
    await syncOrderStatus(tx, order.id);
    return s;
  });

  const vars = { orderNumber: order.number, carrier: carrier?.name ?? input.carrierName ?? "our carrier", trackingNumber: input.trackingNumber ?? "n/a", trackingUrl: trackingUrl ?? "" };
  if (order.userId) {
    await notifyUser(order.userId, { type: "order.shipped", title: `Order ${order.number} shipped`, body: input.trackingNumber ? `Tracking ${input.trackingNumber}` : undefined, href: `/account/orders/${order.number}`, email: { templateKey: "order_shipped", vars } });
  } else {
    await queueTemplateEmail("order_shipped", order.email, { name: "there", ...vars });
  }
  await audit({ actor: input.actor, action: "order.ship", targetType: "order", targetId: order.id, summary: `Shipment created on ${order.number} (${items.length} item${items.length === 1 ? "" : "s"})` });
  return shipment;
}

export async function updateShipmentStatus(shipmentId: string, status: "in_transit" | "out_for_delivery" | "delivered" | "exception" | "returned", actor: ActorRef, opts: { message?: string; location?: string; sellerId?: string | null } = {}) {
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: { select: { id: true, number: true, userId: true, email: true } }, items: { select: { id: true } } } });
  if (!shipment) throw new FulfillmentError("Shipment not found");
  if (actor.type === "seller" && shipment.sellerId !== opts.sellerId) throw new FulfillmentError("Not your shipment");
  await db.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id: shipmentId }, data: { status, deliveredAt: status === "delivered" ? new Date() : shipment.deliveredAt } });
    await tx.shipmentEvent.create({ data: { shipmentId, status, message: opts.message ?? null, location: opts.location ?? null, source: actor.type === "job" ? "carrier" : "manual" } });
    if (status === "delivered") await tx.orderItem.updateMany({ where: { shipmentId }, data: { status: "delivered" } });
    if (status === "returned") await tx.orderItem.updateMany({ where: { shipmentId }, data: { status: "returned" } });
    await addOrderEvent(tx, shipment.orderId, `shipment.${status}`, `Shipment ${status.replace(/_/g, " ")}${opts.message ? `: ${opts.message}` : ""}`, actor);
    await syncOrderStatus(tx, shipment.orderId);
  });
  if (status === "delivered") {
    if (shipment.order.userId) {
      await notifyUser(shipment.order.userId, { type: "order.delivered", title: `Order ${shipment.order.number} delivered`, body: "Your 14-day inspection window starts today.", href: `/account/orders/${shipment.order.number}`, email: { templateKey: "order_delivered", vars: { orderNumber: shipment.order.number } } });
    } else {
      await queueTemplateEmail("order_delivered", shipment.order.email, { name: "there", orderNumber: shipment.order.number });
    }
  }
}

/** Recompute In transit from bank APIs and POST fill. */
import "./load-env.ts";
import { athensDate } from "../src/data.ts";
import { resolveStripeInTransit } from "../src/stripe-in-transit.ts";
import { postSheetsWebhook } from "../src/sheets-webhook.ts";

const date = athensDate();
const inTransit = await resolveStripeInTransit(date);
console.log(date, inTransit);
const sheet = await postSheetsWebhook({ action: "fill", date, inTransit, columns: {} });
console.log(sheet);

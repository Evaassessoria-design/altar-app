import { httpRouter } from "convex/server";
import { asaasReceiver } from "./asaasWebhook";

const http = httpRouter();

http.route({
  path: "/asaas-webhook",
  method: "POST",
  handler: asaasReceiver,
});

export default http;

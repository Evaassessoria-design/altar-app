/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as aiVisual from "../aiVisual.js";
import type * as asaas from "../asaas.js";
import type * as asaasWebhook from "../asaasWebhook.js";
import type * as assemblyItems from "../assemblyItems.js";
import type * as auth from "../auth.js";
import type * as briefing from "../briefing.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as email from "../email.js";
import type * as events from "../events.js";
import type * as financeiro from "../financeiro.js";
import type * as funil from "../funil.js";
import type * as gallery from "../gallery.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as landingLeads from "../landingLeads.js";
import type * as layoutRenders from "../layoutRenders.js";
import type * as demo from "../demo.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_demoData from "../lib/demoData.js";
import type * as lib_demoGuard from "../lib/demoGuard.js";
import type * as lib_supplierIdentity from "../lib/supplierIdentity.js";
import type * as lib_aiConfig from "../lib/aiConfig.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_imageProvider from "../lib/imageProvider.js";
import type * as lib_imageProviderConfig from "../lib/imageProviderConfig.js";
import type * as lib_plantaPrompt from "../lib/plantaPrompt.js";
import type * as notifications from "../notifications.js";
import type * as orcamento from "../orcamento.js";
import type * as purchases from "../purchases.js";
import type * as supplierCatalog from "../supplierCatalog.js";
import type * as suppliers from "../suppliers.js";
import type * as team from "../team.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  aiVisual: typeof aiVisual;
  asaas: typeof asaas;
  asaasWebhook: typeof asaasWebhook;
  assemblyItems: typeof assemblyItems;
  auth: typeof auth;
  briefing: typeof briefing;
  contracts: typeof contracts;
  crons: typeof crons;
  dashboard: typeof dashboard;
  email: typeof email;
  events: typeof events;
  financeiro: typeof financeiro;
  funil: typeof funil;
  gallery: typeof gallery;
  health: typeof health;
  http: typeof http;
  landingLeads: typeof landingLeads;
  layoutRenders: typeof layoutRenders;
  demo: typeof demo;
  "lib/access": typeof lib_access;
  "lib/demoData": typeof lib_demoData;
  "lib/demoGuard": typeof lib_demoGuard;
  "lib/supplierIdentity": typeof lib_supplierIdentity;
  "lib/aiConfig": typeof lib_aiConfig;
  "lib/identity": typeof lib_identity;
  "lib/imageProvider": typeof lib_imageProvider;
  "lib/imageProviderConfig": typeof lib_imageProviderConfig;
  "lib/plantaPrompt": typeof lib_plantaPrompt;
  notifications: typeof notifications;
  orcamento: typeof orcamento;
  purchases: typeof purchases;
  supplierCatalog: typeof supplierCatalog;
  suppliers: typeof suppliers;
  team: typeof team;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};

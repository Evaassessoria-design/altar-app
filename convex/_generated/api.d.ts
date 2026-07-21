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
import type * as asaas from "../asaas.js";
import type * as asaasWebhook from "../asaasWebhook.js";
import type * as briefing from "../briefing.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as events from "../events.js";
import type * as financeiro from "../financeiro.js";
import type * as funil from "../funil.js";
import type * as gallery from "../gallery.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as orcamento from "../orcamento.js";
import type * as purchases from "../purchases.js";
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
  asaas: typeof asaas;
  asaasWebhook: typeof asaasWebhook;
  briefing: typeof briefing;
  contracts: typeof contracts;
  crons: typeof crons;
  dashboard: typeof dashboard;
  events: typeof events;
  financeiro: typeof financeiro;
  funil: typeof funil;
  gallery: typeof gallery;
  http: typeof http;
  notifications: typeof notifications;
  orcamento: typeof orcamento;
  purchases: typeof purchases;
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

export declare const components: {};

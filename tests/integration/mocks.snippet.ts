/**
 * Copy these lines to the top of an integration test file. vitest hoists vi.mock
 * above every import, so the code under test resolves to the fakes in ./fakes/world.
 */
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/admin", () => import("./fakes/world").then((m) => m.factories.admin()));
vi.mock("@/lib/db/server", () => import("./fakes/world").then((m) => m.factories.server()));
vi.mock("@/lib/stripe/client", () => import("./fakes/world").then((m) => m.factories.stripe()));
vi.mock("@/lib/hostaway/api", () => import("./fakes/world").then((m) => m.factories.hostaway()));
vi.mock("@/lib/notifications/email", () => import("./fakes/world").then((m) => m.factories.email()));
vi.mock("@/lib/notifications/slack", () => import("./fakes/world").then((m) => m.factories.slack()));
vi.mock("@/lib/observability/logger", () => import("./fakes/world").then((m) => m.factories.logger()));

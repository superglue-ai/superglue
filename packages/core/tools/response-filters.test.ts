import { FilterAction, FilterTarget, RemoveScope, ResponseFilter } from "@superglue/shared";
import { describe, expect, it } from "vitest";
import { applyResponseFilters, FilterMatchError } from "./response-filters.js";

const createFilter = (overrides: Partial<ResponseFilter> = {}): ResponseFilter => ({
  id: "test-filter",
  enabled: true,
  target: FilterTarget.VALUES,
  pattern: "secret",
  action: FilterAction.REMOVE,
  ...overrides,
});

describe("applyResponseFilters", () => {
  describe("basic functionality", () => {
    it("should return data unchanged when no filters provided", () => {
      const data = { name: "John", email: "john@test.com" };
      const result = applyResponseFilters(data, []);

      expect(result.data).toEqual(data);
      expect(result.matches).toHaveLength(0);
    });

    it("should return data unchanged when all filters are disabled", () => {
      const data = { secret: "password123" };
      const filter = createFilter({ enabled: false });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual(data);
      expect(result.matches).toHaveLength(0);
    });

    it("should track matches in the result", () => {
      const data = { password: "secret123" };
      const filter = createFilter({ target: FilterTarget.KEYS, pattern: "password" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].path).toBe("password");
      expect(result.matches[0].matchedOn).toBe("key");
    });
  });

  describe("FilterTarget", () => {
    it("should match on KEYS only", () => {
      const data = { secretKey: "normal-value", normalKey: "secret-value" };
      const filter = createFilter({ target: FilterTarget.KEYS, pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({ normalKey: "secret-value" });
      expect(result.matches).toHaveLength(1);
    });

    it("should match on VALUES only", () => {
      const data = { secretKey: "normal-value", normalKey: "secret-value" };
      const filter = createFilter({ target: FilterTarget.VALUES, pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({ secretKey: "normal-value" });
      expect(result.matches).toHaveLength(1);
    });

    it("should match on BOTH keys and values", () => {
      const data = { secretKey: "normal", normalKey: "secret" };
      const filter = createFilter({ target: FilterTarget.BOTH, pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({});
      expect(result.matches).toHaveLength(2);
    });
  });

  describe("FilterAction.REMOVE", () => {
    describe("scope: FIELD (default)", () => {
      it("should remove matched key-value pair from object", () => {
        const data = { name: "John", ssn: "123-45-6789" };
        const filter = createFilter({ pattern: "ssn", target: FilterTarget.KEYS });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ name: "John" });
      });

      it("should remove field when value matches", () => {
        const data = { name: "John", code: "secret123" };
        const filter = createFilter({ pattern: "secret" });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ name: "John" });
      });

      it("should remove primitive from array", () => {
        const data = ["public", "secret123", "normal"];
        const filter = createFilter({ pattern: "secret" });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual(["public", "normal"]);
      });

      it("should remove number field when value matches", () => {
        const data = { name: "John", pin: 1234 };
        const filter = createFilter({ pattern: "1234" });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ name: "John" });
      });
    });

    describe("scope: ITEM", () => {
      it("should remove entire object from array when nested field matches", () => {
        const data = {
          users: [
            { name: "John", ssn: "123-45-6789" },
            { name: "Jane", email: "jane@test.com" },
          ],
        };
        const filter = createFilter({
          pattern: "ssn",
          target: FilterTarget.KEYS,
          scope: RemoveScope.ITEM,
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({
          users: [{ name: "Jane", email: "jane@test.com" }],
        });
      });

      it("should remove array item when primitive matches", () => {
        const data = ["secret123", "public", "secret456"];
        const filter = createFilter({ pattern: "secret", scope: RemoveScope.ITEM });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual(["public"]);
      });
    });

    describe("scope: ENTRY", () => {
      it("should remove from top-level array even when match is deeply nested", () => {
        const data = [
          { user: { profile: { ssn: "123-45-6789" } }, name: "John" },
          { user: { profile: { email: "jane@test.com" } }, name: "Jane" },
        ];
        const filter = createFilter({
          pattern: "ssn",
          target: FilterTarget.KEYS,
          scope: RemoveScope.ENTRY,
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual([
          { user: { profile: { email: "jane@test.com" } }, name: "Jane" },
        ]);
      });

      it("should remove entry when deeply nested value matches", () => {
        const data = [
          { nested: { deep: { value: "secret" } } },
          { nested: { deep: { value: "public" } } },
        ];
        const filter = createFilter({ pattern: "secret", scope: RemoveScope.ENTRY });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual([{ nested: { deep: { value: "public" } } }]);
      });
    });
  });

  describe("FilterAction.MASK", () => {
    describe("scope: FIELD (default)", () => {
      it("should mask matched value with default placeholder", () => {
        const data = { name: "John", ssn: "123-45-6789" };
        const filter = createFilter({
          pattern: "\\d{3}-\\d{2}-\\d{4}",
          action: FilterAction.MASK,
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ name: "John", ssn: "[filtered]" });
      });

      it("should mask with custom value", () => {
        const data = { email: "john@secret.com" };
        const filter = createFilter({
          pattern: "secret",
          action: FilterAction.MASK,
          maskValue: "***",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ email: "john@***.com" });
      });

      it("should partially mask matched portion only", () => {
        const data = { message: "Hello secret world" };
        const filter = createFilter({
          pattern: "secret",
          action: FilterAction.MASK,
          maskValue: "[REDACTED]",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({ message: "Hello [REDACTED] world" });
      });

      it("should mask primitive in array", () => {
        const data = ["public", "secret123", "normal"];
        const filter = createFilter({
          pattern: "secret",
          action: FilterAction.MASK,
          maskValue: "***",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual(["public", "***123", "normal"]);
      });
    });

    describe("scope: ITEM", () => {
      it("should replace entire containing object with mask value", () => {
        const data = {
          users: [{ name: "John", ssn: "123-45-6789" }, { name: "Jane" }],
        };
        const filter = createFilter({
          pattern: "ssn",
          target: FilterTarget.KEYS,
          action: FilterAction.MASK,
          scope: RemoveScope.ITEM,
          maskValue: "[REDACTED]",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual({
          users: ["[REDACTED]", { name: "Jane" }],
        });
      });

      it("should replace array item with mask when primitive matches", () => {
        const data = ["secret123", "public"];
        const filter = createFilter({
          pattern: "secret",
          action: FilterAction.MASK,
          scope: RemoveScope.ITEM,
          maskValue: "[HIDDEN]",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual(["[HIDDEN]", "public"]);
      });
    });

    describe("scope: ENTRY", () => {
      it("should replace entire top-level entry with mask value", () => {
        const data = [
          { user: { ssn: "123-45-6789" }, name: "John" },
          { user: { email: "jane@test.com" }, name: "Jane" },
        ];
        const filter = createFilter({
          pattern: "ssn",
          target: FilterTarget.KEYS,
          action: FilterAction.MASK,
          scope: RemoveScope.ENTRY,
          maskValue: "[REDACTED ENTRY]",
        });
        const result = applyResponseFilters(data, [filter]);

        expect(result.data).toEqual([
          "[REDACTED ENTRY]",
          { user: { email: "jane@test.com" }, name: "Jane" },
        ]);
      });
    });
  });

  describe("FilterAction.FAIL", () => {
    it("should track failed filters without modifying data", () => {
      const data = { message: "contains forbidden value" };
      const filter = createFilter({ pattern: "forbidden", action: FilterAction.FAIL });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual(data);
      expect(result.failedFilters).toHaveLength(1);
      expect(result.failedFilters[0].path).toBe("message");
    });

    it("should track multiple failed filters", () => {
      const data = { secret1: "value1", secret2: "value2" };
      const filter = createFilter({
        target: FilterTarget.KEYS,
        action: FilterAction.FAIL,
      });
      const result = applyResponseFilters(data, [filter]);

      expect(result.failedFilters).toHaveLength(2);
    });
  });

  describe("nested structures", () => {
    it("should process deeply nested objects", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              secret: "password",
            },
          },
        },
      };
      const filter = createFilter({ target: FilterTarget.KEYS });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({
        level1: { level2: { level3: {} } },
      });
    });

    it("should process nested arrays", () => {
      const data = {
        items: [
          { subitems: [{ value: "secret1" }, { value: "normal" }] },
          { subitems: [{ value: "secret2" }] },
        ],
      };
      const filter = createFilter({ pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({
        items: [{ subitems: [{}, { value: "normal" }] }, { subitems: [{}] }],
      });
    });

    it("should handle ITEM scope in nested arrays correctly", () => {
      const data = {
        users: [
          {
            activities: [{ type: "login", secret: "token123" }, { type: "logout" }],
          },
        ],
      };
      const filter = createFilter({
        target: FilterTarget.KEYS,
        scope: RemoveScope.ITEM,
      });
      const result = applyResponseFilters(data, [filter]);

      // ITEM should remove from nearest array (activities), not users
      expect(result.data).toEqual({
        users: [{ activities: [{ type: "logout" }] }],
      });
    });
  });

  describe("regex patterns", () => {
    it("should support regex patterns", () => {
      const data = { ssn: "123-45-6789", ein: "12-3456789" };
      const filter = createFilter({ pattern: "\\d{3}-\\d{2}-\\d{4}" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({ ein: "12-3456789" });
    });

    it("should be case insensitive", () => {
      const data = { value: "SECRET", other: "secret", another: "Secret" };
      const filter = createFilter({ pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({});
    });

    it("should handle invalid regex gracefully as literal match", () => {
      const data = { value: "test[invalid" };
      const filter = createFilter({ pattern: "[invalid" });
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({});
    });
  });

  describe("multiple filters", () => {
    it("should apply multiple filters", () => {
      const data = {
        password: "secret123",
        email: "test@example.com",
        name: "John",
      };
      const filters = [
        createFilter({ id: "f1", pattern: "password", target: FilterTarget.KEYS }),
        createFilter({ id: "f2", pattern: "@example.com" }),
      ];
      const result = applyResponseFilters(data, filters);

      expect(result.data).toEqual({ name: "John" });
      expect(result.matches).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("should handle null values", () => {
      const data = { value: null, name: "John" };
      const filter = createFilter();
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({ value: null, name: "John" });
    });

    it("should handle undefined values", () => {
      const data = { value: undefined, name: "John" };
      const filter = createFilter();
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({ value: undefined, name: "John" });
    });

    it("should handle empty objects", () => {
      const data = {};
      const filter = createFilter();
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual({});
    });

    it("should handle empty arrays", () => {
      const data: any[] = [];
      const filter = createFilter();
      const result = applyResponseFilters(data, [filter]);

      expect(result.data).toEqual([]);
    });

    it("should handle root-level primitive string", () => {
      const data = "secret value";
      const filter = createFilter({ pattern: "secret" });
      const result = applyResponseFilters(data, [filter]);

      // Root primitives can't be removed in place
      expect(result.matches).toHaveLength(1);
    });

    it("should handle non-array root with ENTRY scope gracefully", () => {
      const data = { secret: "value" };
      const filter = createFilter({
        target: FilterTarget.KEYS,
        scope: RemoveScope.ENTRY,
      });
      const result = applyResponseFilters(data, [filter]);

      // Should return empty object when root is not in an array
      expect(result.data).toEqual({});
    });
  });

  describe("complex real-world scenarios", () => {
    it("should filter PII from e-commerce order response", () => {
      const orderResponse = {
        orderId: "ORD-12345",
        status: "shipped",
        customer: {
          id: "CUST-001",
          name: "John Doe",
          email: "john.doe@example.com",
          phone: "+1-555-123-4567",
          ssn: "123-45-6789",
          address: {
            street: "123 Main St",
            city: "New York",
            zip: "10001",
          },
        },
        payment: {
          method: "credit_card",
          cardNumber: "4111-1111-1111-1111",
          cvv: "123",
          expiry: "12/25",
        },
        items: [
          { sku: "ITEM-001", name: "Widget", price: 29.99, quantity: 2 },
          { sku: "ITEM-002", name: "Gadget", price: 49.99, quantity: 1 },
        ],
      };

      const filters = [
        createFilter({
          id: "ssn",
          pattern: "\\d{3}-\\d{2}-\\d{4}",
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "card",
          pattern: "cardNumber|cvv",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "email",
          pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
          action: FilterAction.MASK,
          maskValue: "[EMAIL HIDDEN]",
        }),
        createFilter({
          id: "phone",
          pattern: "\\+?\\d{1,3}[- ]?\\d{3}[- ]?\\d{3}[- ]?\\d{4}",
          action: FilterAction.MASK,
          maskValue: "[PHONE HIDDEN]",
        }),
      ];

      const result = applyResponseFilters(orderResponse, filters);

      expect(result.data.customer.ssn).toBeUndefined();
      expect(result.data.customer.email).toBe("[EMAIL HIDDEN]");
      expect(result.data.customer.phone).toBe("[PHONE HIDDEN]");
      expect(result.data.payment.cardNumber).toBeUndefined();
      expect(result.data.payment.cvv).toBeUndefined();
      expect(result.data.payment.method).toBe("credit_card");
      expect(result.data.items).toHaveLength(2);
      expect(result.matches.length).toBeGreaterThanOrEqual(4);
    });

    it("should handle API response with users and nested permissions", () => {
      const apiResponse = {
        success: true,
        data: {
          users: [
            {
              id: 1,
              username: "admin",
              email: "admin@internal.corp",
              password_hash: "5f4dcc3b5aa765d61d8327deb882cf99",
              api_key: "sk_live_abc123xyz",
              profile: {
                firstName: "Admin",
                lastName: "User",
                internalNotes: "Has root access - secret backdoor enabled",
              },
              permissions: ["read", "write", "delete", "admin"],
            },
            {
              id: 2,
              username: "john",
              email: "john@example.com",
              password_hash: "098f6bcd4621d373cade4e832627b4f6",
              api_key: "sk_live_def456uvw",
              profile: {
                firstName: "John",
                lastName: "Doe",
                internalNotes: "Regular user",
              },
              permissions: ["read"],
            },
          ],
          pagination: {
            page: 1,
            total: 2,
            hasMore: false,
          },
        },
      };

      const filters = [
        createFilter({
          id: "password",
          pattern: "password|api_key|secret",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "internal",
          pattern: "internal",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "corp-email",
          pattern: "@internal\\.corp",
          action: FilterAction.MASK,
          maskValue: "@[REDACTED]",
        }),
      ];

      const result = applyResponseFilters(apiResponse, filters);

      // Password and API keys should be removed
      expect(result.data.data.users[0].password_hash).toBeUndefined();
      expect(result.data.data.users[0].api_key).toBeUndefined();
      expect(result.data.data.users[1].password_hash).toBeUndefined();

      // Internal notes should be removed
      expect(result.data.data.users[0].profile.internalNotes).toBeUndefined();

      // Internal email should be masked
      expect(result.data.data.users[0].email).toBe("admin@[REDACTED]");
      expect(result.data.data.users[1].email).toBe("john@example.com"); // Not internal

      // Other data should be preserved
      expect(result.data.data.users[0].username).toBe("admin");
      expect(result.data.data.pagination.total).toBe(2);
    });

    it("should filter sensitive data from webhook payload", () => {
      const webhookPayload = {
        event: "payment.completed",
        timestamp: "2024-01-15T10:30:00Z",
        data: {
          transaction: {
            id: "TXN-789",
            amount: 150.0,
            currency: "USD",
            customer: {
              stripe_customer_id: "cus_abc123",
              billing: {
                card_fingerprint: "fp_xyz789",
                last4: "4242",
                brand: "visa",
              },
            },
          },
          metadata: {
            internal_tracking_id: "INT-999",
            debug_info: {
              secret_key: "sk_test_12345",
              raw_request: '{"card": "4111111111111111"}',
            },
          },
        },
      };

      const filters = [
        createFilter({
          id: "secrets",
          pattern: "secret|fingerprint|raw_request",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "internal-ids",
          pattern: "internal",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
      ];

      const result = applyResponseFilters(webhookPayload, filters);

      expect(result.data.data.metadata.debug_info.secret_key).toBeUndefined();
      expect(result.data.data.metadata.debug_info.raw_request).toBeUndefined();
      expect(result.data.data.metadata.internal_tracking_id).toBeUndefined();
      expect(result.data.data.transaction.customer.billing.card_fingerprint).toBeUndefined();

      // Preserved data
      expect(result.data.data.transaction.amount).toBe(150.0);
      expect(result.data.data.transaction.customer.billing.last4).toBe("4242");
    });

    it("should remove entire users with sensitive flags using ENTRY scope", () => {
      const userList = [
        { id: 1, name: "Public User", role: "user", verified: true },
        { id: 2, name: "Test Account", role: "test", isTestAccount: true },
        { id: 3, name: "Another User", role: "user", verified: true },
        { id: 4, name: "Internal Bot", role: "bot", isInternal: true },
        { id: 5, name: "Regular User", role: "user", verified: false },
      ];

      const filters = [
        createFilter({
          id: "test-accounts",
          pattern: "isTestAccount|isInternal",
          target: FilterTarget.KEYS,
          scope: RemoveScope.ENTRY,
          action: FilterAction.REMOVE,
        }),
      ];

      const result = applyResponseFilters(userList, filters);

      expect(result.data).toHaveLength(3);
      expect(result.data.map((u: any) => u.id)).toEqual([1, 3, 5]);
    });

    it("should handle deeply nested arrays with ITEM scope", () => {
      const orgStructure = {
        company: "Acme Corp",
        departments: [
          {
            name: "Engineering",
            teams: [
              {
                name: "Backend",
                members: [
                  { name: "Alice", clearance: "public" },
                  { name: "Bob", clearance: "secret", accessCode: "XYZ123" },
                  { name: "Charlie", clearance: "public" },
                ],
              },
              {
                name: "Frontend",
                members: [
                  { name: "Diana", clearance: "public" },
                  { name: "Eve", clearance: "topsecret", accessCode: "ABC789" },
                ],
              },
            ],
          },
          {
            name: "Sales",
            teams: [
              {
                name: "Enterprise",
                members: [{ name: "Frank", clearance: "public" }],
              },
            ],
          },
        ],
      };

      const filter = createFilter({
        pattern: "accessCode",
        target: FilterTarget.KEYS,
        scope: RemoveScope.ITEM,
        action: FilterAction.REMOVE,
      });

      const result = applyResponseFilters(orgStructure, [filter]);

      // Bob and Eve should be removed (they have accessCode)
      const backend = result.data.departments[0].teams[0];
      const frontend = result.data.departments[0].teams[1];
      const enterprise = result.data.departments[1].teams[0];

      expect(backend.members).toHaveLength(2);
      expect(backend.members.map((m: any) => m.name)).toEqual(["Alice", "Charlie"]);

      expect(frontend.members).toHaveLength(1);
      expect(frontend.members[0].name).toBe("Diana");

      expect(enterprise.members).toHaveLength(1);
      expect(enterprise.members[0].name).toBe("Frank");
    });

    it("should mask sensitive values in mixed-type arrays", () => {
      const config = {
        settings: [
          { key: "theme", value: "dark" },
          { key: "api_secret", value: "super_secret_value_123" },
          { key: "timeout", value: 30 },
          { key: "password", value: "hunter2" },
          { key: "debug", value: true },
        ],
      };

      const filter = createFilter({
        pattern: "secret|password",
        target: FilterTarget.BOTH,
        action: FilterAction.MASK,
        maskValue: "***",
        scope: RemoveScope.FIELD,
      });

      const result = applyResponseFilters(config, [filter]);

      expect(result.data.settings[0].value).toBe("dark");
      expect(result.data.settings[1].key).toBe("api_***"); // key partial masked
      expect(result.data.settings[1].value).toBe("super_***_value_123"); // value partial mask
      expect(result.data.settings[2].value).toBe(30);
      expect(result.data.settings[3].key).toBe("***"); // key fully matches pattern
      expect(result.data.settings[3].value).toBe("hunter2"); // value doesn't match pattern
      expect(result.data.settings[4].value).toBe(true);
    });

    it("should handle complex GraphQL-style response with connections", () => {
      const graphqlResponse = {
        data: {
          viewer: {
            id: "user_123",
            login: "johndoe",
            email: "john@secret-corp.com",
          },
          repository: {
            name: "my-app",
            secretsConnection: {
              edges: [
                { node: { name: "API_KEY", value: "sk_live_xxx" } },
                { node: { name: "DB_URL", value: "postgres://user:pass@host/db" } },
              ],
            },
            collaborators: {
              edges: [
                {
                  node: {
                    login: "alice",
                    email: "alice@public.com",
                    accessToken: "ghp_xxxx",
                  },
                },
                {
                  node: {
                    login: "bob",
                    email: "bob@secret-corp.com",
                    accessToken: "ghp_yyyy",
                  },
                },
              ],
            },
          },
        },
      };

      const filters = [
        createFilter({
          id: "tokens",
          pattern: "accessToken|value",
          target: FilterTarget.KEYS,
          action: FilterAction.REMOVE,
        }),
        createFilter({
          id: "secret-emails",
          pattern: "@secret-corp\\.com",
          action: FilterAction.MASK,
          maskValue: "@[REDACTED]",
        }),
      ];

      const result = applyResponseFilters(graphqlResponse, filters);

      // Tokens removed
      expect(result.data.data.repository.secretsConnection.edges[0].node.value).toBeUndefined();
      expect(result.data.data.repository.collaborators.edges[0].node.accessToken).toBeUndefined();

      // Secret corp emails masked
      expect(result.data.data.viewer.email).toBe("john@[REDACTED]");
      expect(result.data.data.repository.collaborators.edges[1].node.email).toBe("bob@[REDACTED]");

      // Public email preserved
      expect(result.data.data.repository.collaborators.edges[0].node.email).toBe(
        "alice@public.com",
      );
    });

    it("should handle arrays at multiple nesting levels with different scopes", () => {
      const data = {
        categories: [
          {
            id: "cat-1",
            products: [
              {
                id: "prod-1",
                variants: [
                  { sku: "VAR-1", secret_price: 100 },
                  { sku: "VAR-2", price: 50 },
                ],
              },
            ],
          },
          {
            id: "cat-2",
            products: [
              {
                id: "prod-2",
                variants: [
                  { sku: "VAR-3", price: 75 },
                  { sku: "VAR-4", secret_price: 200 },
                ],
              },
            ],
          },
        ],
      };

      // Test FIELD scope - only remove the secret_price field
      const fieldFilter = createFilter({
        pattern: "secret_price",
        target: FilterTarget.KEYS,
        scope: RemoveScope.FIELD,
        action: FilterAction.REMOVE,
      });

      const fieldResult = applyResponseFilters(data, [fieldFilter]);
      expect(fieldResult.data.categories[0].products[0].variants[0].secret_price).toBeUndefined();
      expect(fieldResult.data.categories[0].products[0].variants[0].sku).toBe("VAR-1");
      expect(fieldResult.data.categories[0].products[0].variants).toHaveLength(2);

      // Test ITEM scope - remove the variant containing secret_price
      const itemFilter = createFilter({
        pattern: "secret_price",
        target: FilterTarget.KEYS,
        scope: RemoveScope.ITEM,
        action: FilterAction.REMOVE,
      });

      const itemResult = applyResponseFilters(data, [itemFilter]);
      expect(itemResult.data.categories[0].products[0].variants).toHaveLength(1);
      expect(itemResult.data.categories[0].products[0].variants[0].sku).toBe("VAR-2");
      expect(itemResult.data.categories[1].products[0].variants).toHaveLength(1);
      expect(itemResult.data.categories[1].products[0].variants[0].sku).toBe("VAR-3");

      // Test ENTRY scope - remove entire category containing secret_price
      const entryFilter = createFilter({
        pattern: "secret_price",
        target: FilterTarget.KEYS,
        scope: RemoveScope.ENTRY,
        action: FilterAction.REMOVE,
      });

      const entryResult = applyResponseFilters(data, [entryFilter]);
      expect(entryResult.data.categories).toHaveLength(0); // Both categories had secret_price somewhere
    });
  });
});

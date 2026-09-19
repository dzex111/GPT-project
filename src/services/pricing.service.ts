import { z } from "zod";
import type { Service } from "@prisma/client";

const parameterFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "select"]),
  required: z.boolean().default(true),
  options: z.array(
    z.object({
      value: z.string().min(1),
      label: z.string().min(1)
    })
  ).default([])
});

const pricingRuleSchema = z.object({
  when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  type: z.enum(["flat", "multiplier"]),
  amount: z.number()
});

const serviceDefinitionSchema = z.object({
  fields: z.array(parameterFieldSchema).default([]),
  pricingRules: z.array(pricingRuleSchema).default([])
});

export type ServiceField = z.infer<typeof parameterFieldSchema>;
export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;

export class PricingService {
  getDefinition(service: Service): ServiceDefinition {
    const parsed = serviceDefinitionSchema.safeParse(service.parameters);
    if (!parsed.success) {
      throw new Error("Invalid service parameters");
    }
    return parsed.data;
  }

  getMissingFields(service: Service, parameters: Record<string, unknown>) {
    const definition = this.getDefinition(service);
    return definition.fields.filter(
      field => field.required && this.normalize(parameters[field.key]) === ""
    );
  }

  parseFieldValue(field: ServiceField, input: string): string {
    const normalizedInput = input.trim();
    if (!normalizedInput) {
      throw new Error("Parameter value cannot be empty");
    }

    if (field.type === "text") {
      return normalizedInput;
    }

    const match = field.options.find(option =>
      this.normalize(option.value) === this.normalize(normalizedInput) ||
      this.normalize(option.label) === this.normalize(normalizedInput)
    );

    if (!match) {
      throw new Error("Invalid parameter value");
    }

    return match.value;
  }

  calculatePrice(service: Service, parameters: Record<string, unknown>) {
    const definition = this.getDefinition(service);
    let priceMinor = service.basePriceMinor;

    for (const rule of definition.pricingRules) {
      const applies = Object.entries(rule.when).every(([key, expected]) =>
        this.normalize(parameters[key]) === this.normalize(expected)
      );

      if (!applies) {
        continue;
      }

      if (rule.type === "flat") {
        priceMinor += Math.round(rule.amount);
      } else {
        priceMinor = Math.round(priceMinor * rule.amount);
      }
    }

    return Math.max(0, priceMinor);
  }

  formatPrice(priceMinor: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(priceMinor / 100);
  }

  private normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
  }
}

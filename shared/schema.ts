import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// User roles hierarchy: admin > internal_designer > vendor > vendor_designer > client
export const userRoles = ["admin", "internal_designer", "vendor", "vendor_designer", "client"] as const;
export type UserRole = typeof userRoles[number];

// Client payment methods
export const paymentMethods = ["pay_as_you_go", "monthly_payment", "deduct_from_royalties"] as const;
export type PaymentMethod = typeof paymentMethods[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  isActive: boolean("is_active").notNull().default(true),
  // Vendor relationship - links vendor_designer to their parent vendor
  vendorId: varchar("vendor_id"),
  // Client payment configuration
  paymentMethod: text("payment_method"),
  invitedBy: varchar("invited_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vendor profiles with pricing agreements and SLAs
export const vendorProfiles = pgTable("vendor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyName: text("company_name").notNull(),
  website: text("website"),
  // Pricing agreements per service type (JSON structure)
  pricingAgreements: jsonb("pricing_agreements"),
  // SLA configuration (JSON: { serviceType: { days: number, hours: number } })
  slaConfig: jsonb("sla_config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  priceRange: text("price_range"),
  category: text("category").notNull(),
  decorationMethods: text("decoration_methods"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  assigneeId: varchar("assignee_id").references(() => users.id),
  status: text("status").notNull().default("pending"),
  orderNumber: text("order_number"),
  customerName: text("customer_name"),
  notes: text("notes"),
  requirements: text("requirements"),
  decorationMethod: text("decoration_method"),
  quantity: integer("quantity"),
  dueDate: timestamp("due_date"),
  deliveredAt: timestamp("delivered_at"),
  deliveredBy: varchar("delivered_by").references(() => users.id),
  changeRequestNote: text("change_request_note"),
  completedAt: timestamp("completed_at"),
  formData: jsonb("form_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const serviceAttachments = pgTable("service_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  kind: text("kind").notNull().default("request"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("public"),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  phone: true,
  role: true,
  vendorId: true,
  paymentMethod: true,
  invitedBy: true,
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVendorProfileSchema = createInsertSchema(vendorProfiles).partial().omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  deliveredBy: true,
  completedAt: true,
});

export const updateServiceRequestSchema = createInsertSchema(serviceRequests).partial().omit({
  id: true,
  createdAt: true,
});

export const insertAttachmentSchema = createInsertSchema(serviceAttachments).omit({
  id: true,
  uploadedAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type UpdateVendorProfile = z.infer<typeof updateVendorProfileSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type ServiceAttachment = typeof serviceAttachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

// Helper type for pricing agreements structure
export type PricingAgreement = {
  serviceType: string;
  basePrice: number;
  complexity?: { basic?: number; standard?: number; advanced?: number; premium?: number };
  variablePricing?: { perProduct?: number };
  extras?: { vectorization?: number };
};

// Helper type for SLA configuration
export type SLAConfig = {
  [serviceType: string]: {
    days: number;
    hours?: number;
  };
};
